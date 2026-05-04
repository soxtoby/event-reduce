import { log } from "./logging"
import { type EventsClass, isEventsClass, isModel, type Model, StateProperty } from "./models"
import { type ISource, isSource, Source } from "./sources"
import { dispose, emptyArray, emptyMap, isDisposable, isObject, nameOfFunction } from "./utils"

type GraphNode = ISource<any> | Model | EventsClass

/** Child -> parent -> path. */
let parentRegistry = new WeakMap<GraphNode, Map<GraphNode, string>>()
/** Value -> node -> path. */
let childSnapshots = new WeakMap<object, ReadonlyMap<GraphNode, string>>()
let garbage = new Set<GraphNode & Disposable>()

let currentCreationScope: Set<GraphNode & ISource<any>> | null = null

export function updateChildren(parent: GraphNode, previousValue: unknown, nextValue: unknown, parentPath = '') {
    if (Object.is(previousValue, nextValue))
        return

    let previousChildren: ReadonlyMap<GraphNode, string> = emptyMap
    if (isObject(previousValue) || previousValue instanceof Source) {
        previousChildren = childSnapshots.get(previousValue) ?? getChildNodes(previousValue)
        childSnapshots.delete(previousValue)
    }

    let newChildren: ReadonlyMap<GraphNode, string> = emptyMap
    if (isObject(nextValue) || nextValue instanceof Source) {
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

    if (value instanceof StateProperty)
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

export function disposeGarbage() {
    for (let node of garbage) {
        if (!parentRegistry.has(node)) {
            log('🗑️ (dispose)', getPath(node), emptyArray, undefined)
            node[dispose]()
        }
    }
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

export function getPath(node: GraphNode): string {
    let primaryOwner = parentRegistry.get(node)?.entries().next().value
    return primaryOwner
        ? getPath(primaryOwner[0]) + primaryOwner[1]
        : isSource(node) ? node.displayName
            : isObject(node) ? nameOfFunction(node.constructor) || '$'
                : '$'
}

export class UntrackedSourceError extends Error {
    constructor(source: ISource<any>) {
        super(`Leak detected: ${nameOfFunction(source.constructor)} '${source.displayName}' created without an owner.
Make sure reductions are defined on a model, and that the model is either a class decorated with @model, or created using createModel().`)
    }
}
