import { log } from "./logging"
import { type IObservable, isObservable } from "./observable"
import { type EventsClass, isEventsClass, isModel, isStateProperty, type Model } from "./symbols"
import { iterationSource } from "./tracking"
import { dispose, emptyArray, emptyMap, isDisposable, isObject, nameOfFunction } from "./utils"

type GraphNode = IObservable<any> | Model | EventsClass

/** Child -> parent -> path. */
let parentRegistry = new WeakMap<GraphNode, Map<GraphNode, string>>()
/** Value -> node -> path. */
let childSnapshots = new WeakMap<object, ReadonlyMap<GraphNode, string>>()
let garbage = new Set<GraphNode & Disposable>()

interface CreationScope {
    observables: Set<GraphNode & IObservable<any>>
    /** Null if models created in this scope aren't checked for an owner. */
    models: Set<Model> | null
}

let currentCreationScope: CreationScope | null = null

export function updateChildren(parent: GraphNode, previousValue: unknown, nextValue: unknown, parentPath = '') {
    if (Object.is(previousValue, nextValue))
        return

    if (!isObject(previousValue) && isGraphNode(nextValue)) {
        addParent(nextValue, parent, parentPath) // Fast-track for adding single node
        return
    }

    if (!isObject(nextValue) && isGraphNode(previousValue)) {
        removeParent(previousValue, parent) // Fast-track for removing single node
        return
    }

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
            addParent(added, parent, parentPath + path)
}

export function getChildNodes(value: object): ReadonlyMap<GraphNode, string> {
    if (isGraphNode(value))
        return new Map([[value, '']])

    if (isStateProperty(value))
        return isObject(value.value)
            ? new Map(getChildNodes(value.value)
                .entries()
                .map(([node, path]) => [node, `.${String(value.key)}${path}`]))
            : emptyMap

    if (Array.isArray(value))
        return new Map(value
            .filter(isGraphNode)
            .map((obj, i) => [obj, `[${i}]`]))

    return new Map(Object.entries(value)
        .filter(([_, val]) => isGraphNode(val))
        .map(([key, val]) => [val, `.${key}`]))
}

function isGraphNode(value: unknown): value is GraphNode {
    return isObservable(value)
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

/** Does nothing during a transition, since the transition disposes garbage when it ends. */
export function disposeGarbage() {
    if (!iterationSource) {
        for (let node of garbage) {
            garbage.delete(node) // Disposing can dispose more garbage, which shouldn't include this again
            if (!parentRegistry.has(node)) {
                log('🗑️ (dispose)', getName(node), emptyArray, () => ({ Path: getPath(node) }))
                node[dispose]()
            }
        }
    }
}

export interface IManagedObservableTracker extends Disposable {
    verifyObservableManagement(): void
}

/**
 * Tracks observables, and optionally models, created until the tracker is disposed.
 * @param modelCreator - The derivation or reduction whose value should own the models created in this scope. If not provided, models aren't checked.
 */
export function trackManagedObservableCreation(modelCreator?: IObservable<any>): IManagedObservableTracker {
    let previousScope = currentCreationScope
    let currentScope = currentCreationScope = {
        observables: new Set(),
        models: process.env.NODE_ENV !== 'production' && modelCreator ? new Set() : null
    }
    return {
        verifyObservableManagement() {
            for (let object of currentScope.observables)
                if (!parentRegistry.has(object))
                    throw new UntrackedObservableError(object)

            for (let model of currentScope.models ?? emptyArray)
                if (!parentRegistry.has(model))
                    throw new UnownedModelError(model, modelCreator!)
        },
        [dispose]() { currentCreationScope = previousScope }
    }
}

export function managedObservableCreated(observable: GraphNode & IObservable<any>) {
    if (!currentCreationScope)
        throw new UntrackedObservableError(observable)
    currentCreationScope.observables.add(observable)
}

/** Called once a model has finished constructing, so the scope it was created in can check that something owns it. */
export function managedModelCreated(model: Model) {
    currentCreationScope?.models?.add(model)
}

export function getPath(node: GraphNode): string {
    let primaryOwner = parentRegistry.get(node)?.entries().next().value
    return primaryOwner
        ? getPath(primaryOwner[0]) + primaryOwner[1]
        : getName(node)
}

function getName(node: GraphNode) {
    return isObservable(node) ? node.displayName
        : isObject(node) ? nameOfFunction(node.constructor) || '$'
            : '$'
}

export class UntrackedObservableError extends Error {
    constructor(observable: IObservable<any>) {
        super(`Leak detected: ${nameOfFunction(observable.constructor)} '${observable.displayName}' created without an owner.
Make sure reductions are defined on a model, and that the model is either a class decorated with @model, or created using createModel().`)
    }
}

export class UnownedModelError extends Error {
    constructor(
        public model: Model,
        public creator: IObservable<any>
    ) {
        super(`Leak detected: ${getName(model)} created in '${creator.path}' has no owner.
'${creator.displayName}' only owns models in its value that are the value itself, in an array, or a property of an object. Models nested any deeper aren't owned.`)
    }
}

