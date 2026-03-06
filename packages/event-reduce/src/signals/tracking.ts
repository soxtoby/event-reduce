import { dispose, emptySet, isObject, nameOfFunction } from "../utils"
import { isModel, Model } from "./models"
import { Reduction } from "./reduction"
import { IObserver, ISource, SourceBase } from "./signals"

type ManagedObject = Reduction<any, any> | Model
type Owner = ISource<any> | Model

export let currentIteration = 0
export let iterationSource: ISource<any> | null = null

let currentAccessTracker: AccessTracker | null = null
let lastSourceAccessed: ISource<any> | null = null

let ownerRegistry = new WeakMap<ManagedObject, Set<Owner>>()
let ownedObjectsSnapshots = new WeakMap<object, ReadonlySet<ManagedObject>>()
let garbage = new Set<ManagedObject>()

let currentCreationScope: Set<ManagedObject & ISource<any>> | null = null

export function beginTransition(source: ISource<any>) {
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
}

export function trackAccessedSources(observer: IObserver<any> | null) {
    return new AccessTracker(observer)
}

export function sourceWasAccessed(source: ISource<any>) {
    currentAccessTracker?.addAccessed(source)
    lastSourceAccessed = source
}

export function getUnderlyingSource<T>(value: T): ISource<T> | null {
    return lastSourceAccessed
        && lastSourceAccessed instanceof SourceBase
        && Object.is(lastSourceAccessed.value, value)
        ? lastSourceAccessed
        : null
}

export function updateOwnedObjects(owner: Owner, previousValue: unknown, nextValue: unknown) {
    if (Object.is(previousValue, nextValue))
        return

    let previouslyOwned = emptySet
    if (isObject(previousValue)) {
        previouslyOwned = ownedObjectsSnapshots.get(previousValue) ?? emptySet
        ownedObjectsSnapshots.delete(previousValue)
    }

    let newlyOwned = emptySet
    if (isObject(nextValue)) {
        newlyOwned = getManagedObjects(nextValue)
        ownedObjectsSnapshots.set(nextValue, newlyOwned)
    }

    for (let removed of previouslyOwned)
        if (!newlyOwned.has(removed))
            removeOwner(removed, owner)

    for (let added of newlyOwned)
        if (!previouslyOwned.has(added))
            addOwner(added, owner)
}

function getManagedObjects(value: object): ReadonlySet<ManagedObject> {
    return isManagedObject(value) ? new Set([value])
        : Array.isArray(value) ? new Set(value.filter(isManagedObject))
            : new Set(Object.values(value).filter(isManagedObject))
}

export function isManagedObject(value: unknown): value is ManagedObject {
    return isModel(value)
        || value instanceof Reduction
}

function addOwner(object: ManagedObject, owner: Owner) {
    let owners = ownerRegistry.get(object)

    if (!owners)
        ownerRegistry.set(object, owners = new Set())

    owners.add(owner)
}

function removeOwner(object: ManagedObject, owner: Owner) {
    let owners = ownerRegistry.get(object)
    if (owners) {
        owners.delete(owner)

        if (!owners.size) {
            ownerRegistry.delete(object)
            garbage.add(object)
        }
    }
}

function disposeGarbage() {
    for (let object of garbage)
        if (!ownerRegistry.has(object)) // In case a new owner was added
            object[dispose]()
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
                if (!ownerRegistry.has(object))
                    throw new UntrackedSourceError(object)
        },
        [dispose]() { currentCreationScope = previousScope }
    }
}

export function managedSourceCreated(source: ManagedObject & ISource<any>) {
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

class CircularDependencyError extends Error {
    constructor(path: ISource<any>[]) { super(`Circular dependency detected: ${path.map(s => s.displayName).join(' -> ')}`) }
}

class SideEffectDuringReactionError extends Error {
    constructor(
        public reactingTo: ISource<any>,
        public causing: ISource<any>
    ) { super(`Side effect during reaction to ${reactingTo.displayName} in ${causing.displayName}`) }
}

class UntrackedSourceError extends Error {
    constructor(source: ISource<any>) { super(`Leak detected: ${nameOfFunction(source.constructor)} '${source.displayName}' created without an owner.`) } // NOCOMMIT say what to do about it
}