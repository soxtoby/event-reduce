import { dispose, emptyMap, isDisposable, isObject, nameOfFunction, nullDisposable } from "../utils"
import { Effect } from "./effect"
import { type EventsClass, isEventsClass, isModel, type Model, StateProperty } from "./nodes"
import { type IObserver, type ISource, isSource, SourceBase } from "./signals"

type GraphNode = ISource<any> | Model | EventsClass

export let currentIteration = 0
export let iterationSource: ISource<any> | Effect<any> | null = null

let currentAccessTracker: AccessTracker | null = null
let lastSourceAccessed: ISource<any> | null = null

/** Child -> parent -> path. */
let parentRegistry = new WeakMap<GraphNode, Map<GraphNode, string>>()
/** Value -> node -> path. */
let childSnapshots = new WeakMap<object, ReadonlyMap<GraphNode, string>>()
let garbage = new Set<GraphNode & Disposable>()

let currentCreationScope: Set<GraphNode & ISource<any>> | null = null

export function beginTransition(source: ISource<any> | Effect<any>, isTriggerEvent: boolean): Disposable {
    if (isTriggerEvent) {
        if (iterationSource)
            throw new SideEffectDuringReactionError(iterationSource, source)

        currentIteration++
        iterationSource = source

        return {
            [dispose]() {
                iterationSource = null
                disposeGarbage()
            }
        }
    } else {
        return nullDisposable
    }
}

export function collectAccessedSources(observer: IObserver<any> | null) {
    return new AccessTracker(observer)
}

export function trackSourceAccessed(source: ISource<any>): Disposable {
    currentAccessTracker?.addAccessed(source)
    return { [dispose]() { lastSourceAccessed = source } }
}

export function getUnderlyingSource<T>(value: T): ISource<T> | null {
    return lastSourceAccessed
        && lastSourceAccessed instanceof SourceBase
        && Object.is(lastSourceAccessed.value, value)
        ? lastSourceAccessed
        : null
}

export function updateChildren(parent: GraphNode, previousValue: unknown, nextValue: unknown) {
    if (Object.is(previousValue, nextValue))
        return

    let previousChildren: ReadonlyMap<GraphNode, string> = emptyMap
    if (isObject(previousValue)) {
        previousChildren = childSnapshots.get(previousValue) ?? getChildNodes(previousValue)
        childSnapshots.delete(previousValue)
    }

    let newChildren: ReadonlyMap<GraphNode, string> = emptyMap
    if (isObject(nextValue)) {
        newChildren = getChildNodes(nextValue)
        childSnapshots.set(nextValue, newChildren)
    }

    for (let [removed, _] of previousChildren)
        if (!newChildren.has(removed))
            removeParent(removed, parent)

    for (let [added, path] of newChildren)
        if (!previousChildren.has(added))
            addParent(added, parent, path)
}

export function getChildNodes(value: object): ReadonlyMap<GraphNode, string> {
    if (isGraphNode(value))
        return new Map([[value, '']])

    if (value instanceof StateProperty)
        return new Map(getChildNodes(value.value)
            .entries()
            .map(([node, path]) => [node, `.${String(value.key)}${path}`]))

    if (Array.isArray(value))
        return new Map(value
            .filter(isGraphNode)
            .map((obj, i) => [obj, `[${i}]`]))

    return new Map(Object.entries(value)
        .filter(([_, val]) => isGraphNode(val))
        .map(([key, val]) => [val, `.${key}`]))
}

function isGraphNode(value: unknown): value is GraphNode {
    return isSource(value)
        || isModel(value)
        || isEventsClass(value)
}

function addParent(object: GraphNode, owner: GraphNode, path: string) {
    let parents = parentRegistry.get(object)

    if (!parents)
        parentRegistry.set(object, parents = new Map())

    parents.set(owner, path)
}

function removeParent(node: GraphNode, parent: GraphNode) {
    let parents = parentRegistry.get(node)
    if (parents) {
        parents.delete(parent)

        if (!parents.size && isDisposable(node)) {
            parentRegistry.delete(node)
            garbage.add(node)
        }
    }
}

function disposeGarbage() {
    for (let node of garbage)
        if (!parentRegistry.has(node)) // In case a new parent was added
            node[dispose]()
    garbage.clear()
}

export interface IManagedSourceTracker extends Disposable {
    verifySourceManagement(): void
}

export function trackManagedSourceCreation(): IManagedSourceTracker {
    let previousScope = currentCreationScope
    let currentScope = currentCreationScope = new Set()
    return {
        verifySourceManagement() {
            for (let object of currentScope)
                if (!parentRegistry.has(object))
                    throw new UntrackedSourceError(object)
        },
        [dispose]() { currentCreationScope = previousScope }
    }
}

export function managedSourceCreated(source: GraphNode & ISource<any>) {
    if (!currentCreationScope)
        throw new UntrackedSourceError(source)
    currentCreationScope.add(source)
}

export interface IAccessTracker extends Disposable {
    readonly accessed: ReadonlySet<ISource<any>>
}

class AccessTracker implements IAccessTracker {
    private readonly _previous: AccessTracker | null
    readonly accessed = new Set<ISource<any>>()

    constructor(private readonly _observer: IObserver<any> | null) {
        this._previous = currentAccessTracker
        currentAccessTracker = this
    }

    addAccessed(source: ISource<any>) {
        if (this._observer) {
            let circularDependency = this.findCircularDependency(source)
            if (circularDependency)
                throw new CircularDependencyError([...circularDependency, source])
        }

        this.accessed.add(source)
    }

    private findCircularDependency(source: ISource<any>): ISource<any>[] | null {
        if (this._observer == source as any as IObserver<any>)
            return [source]
        let circularDependency = this._previous?.findCircularDependency(source)
        return circularDependency
            ? [...circularDependency, this._observer as any as ISource<any>]
            : null
    }

    [dispose]() {
        currentAccessTracker = this._previous
    }
}

export function getPath(node: GraphNode): string {
    let primaryOwner = parentRegistry.get(node)?.entries().next().value
    return primaryOwner
        ? getPath(primaryOwner[0]) + primaryOwner[1]
        : isSource(node) ? node.displayName
            : isObject(node) ? nameOfFunction(node.constructor) || '$'
                : '$'
}

export class CircularDependencyError extends Error {
    constructor(path: ISource<any>[]) { super(`Circular dependency detected: ${path.map(s => s.displayName).join(' -> ')}.`) }
}

export class SideEffectDuringReactionError extends Error {
    constructor(
        public reactingTo: ISource<any> | Effect<any>,
        public sideEffect: ISource<any> | Effect<any>
    ) { super(`${sideEffect.displayName} side effect during reaction to ${reactingTo.displayName}.`) }
}

export class UntrackedSourceError extends Error {
    constructor(source: ISource<any>) { super(`Leak detected: ${nameOfFunction(source.constructor)} '${source.displayName}' created without an owner.`) } // NOCOMMIT say what to do about it
}