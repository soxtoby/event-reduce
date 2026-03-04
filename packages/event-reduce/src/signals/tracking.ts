import { dispose, emptySet } from "../utils"
import { isModel, Model } from "./models"
import { Reduction } from "./reduction"
import { ISource } from "./signals"

export type Trackable = Reduction<any, any> | Model

export type Owner = ISource<any> | Model

let ownerStack: Owner[] = []

let ownerRegistry = new WeakMap<Trackable, Set<Owner>>()

let ownedValuesSnapshots = new WeakMap<object, Set<Trackable>>()

export function addOwner(trackable: Trackable, owner: Owner) {
    let owners = ownerRegistry.get(trackable)

    if (!owners) {
        owners = new Set<Owner>()
        ownerRegistry.set(trackable, owners)
    }

    owners.add(owner)
}

export function removeOwner(trackable: Trackable, owner: Owner) {
    let owners = ownerRegistry.get(trackable)
    if (owners) {
        owners.delete(owner)

        if (!owners.size) {
            // NOCOMMIT register to be disposed at the end of the current operation
            // In case an owner is added again. Also handle models.
            ownerRegistry.delete(trackable)
            if (trackable instanceof Reduction)
                trackable[dispose]()
        }
    }
}

// TODO may not need this if we're just going to check values anyway, although still want to avoid loose reductions
export function withOwner(owner: Owner) {
    ownerStack.push(owner)
    return { [dispose]() { ownerStack.pop() } } as Disposable
}

export function currentOwnerScope() {
    return ownerStack.at(-1)
}

export function updateOwnedValues(owner: Owner, previousValue: unknown, nextValue: unknown) {
    if (Object.is(previousValue, nextValue))
        return

    let previouslyTracked = canContainTrackableValues(previousValue)
        ? ownedValuesSnapshots.get(previousValue) ?? collectTrackableValues(previousValue)
        : emptySet

    let newlyTracked = canContainTrackableValues(nextValue)
        ? collectTrackableValues(nextValue)
        : emptySet

    for (let removed of previouslyTracked)
        if (!newlyTracked.has(removed))
            removeOwner(removed, owner)

    for (let added of newlyTracked)
        if (!previouslyTracked.has(added))
            addOwner(added, owner)
}

function collectTrackableValues(value: object): ReadonlySet<Trackable> {
    return isTrackable(value) ? new Set([value])
        : Array.isArray(value) ? new Set(value.filter(isTrackable))
            : new Set(Object.values(value).filter(isTrackable))
}

function canContainTrackableValues(value: unknown): value is object {
    return !!value
        && typeof value == 'object'
}

export function isTrackable(value: unknown): value is Trackable {
    return isModel(value)
        || value instanceof Reduction
}
