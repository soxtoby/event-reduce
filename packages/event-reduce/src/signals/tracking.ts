import { dispose } from "../utils"
import { isModel, Model } from "./models"
import { Source } from "./signals"

export type Trackable = object & {
    [dispose](): void
}

export type Owner = Source<any> | Model

let ownerStack: Owner[] = []

type OwnedValue = Trackable | Model

let ownedValueOwners = new WeakMap<object, Set<Owner>>()

let modelOwnedValues = new WeakMap<Model, Set<Trackable>>()

type OwnedValuesSnapshot = {
    value: unknown
    owned: Set<OwnedValue>
}

let ownerOwnedValues = new WeakMap<Owner, OwnedValuesSnapshot>()

export function addTrackableOwner(trackable: Trackable, owner: Owner) {
    let owners = ownedValueOwners.get(trackable)
    if (!owners) {
        owners = new Set()
        ownedValueOwners.set(trackable, owners)
    }

    let hadOwners = !!owners.size
    owners.add(owner)
    return !hadOwners
}

export function removeTrackableOwner(trackable: Trackable, owner: Owner) {
    let owners = ownedValueOwners.get(trackable)
    if (!owners)
        return false

    owners.delete(owner)

    if (!owners.size) {
        ownedValueOwners.delete(trackable)
        trackable[dispose]()
        return true
    }

    return false
}

export function hasTrackableOwners(trackable: Trackable) {
    return !!ownedValueOwners.get(trackable)?.size
}

export function withOwner<T>(owner: Owner, callback: () => T): T {
    ownerStack.push(owner)
    try {
        return callback()
    } finally {
        ownerStack.pop()
    }
}

export function currentOwner() {
    return ownerStack.at(-1)
}

export function updateOwnedValues(owner: Owner, previousValue: unknown, nextValue: unknown) {
    if (Object.is(previousValue, nextValue))
        return

    let snapshot = ownerOwnedValues.get(owner)
    let oldOwned = snapshot && Object.is(snapshot.value, previousValue)
        ? snapshot.owned
        : collectOwnedValues(previousValue)

    let newOwned = collectOwnedValues(nextValue)
    ownerOwnedValues.set(owner, { value: nextValue, owned: newOwned })

    if (!oldOwned.size && !newOwned.size)
        return

    if (!oldOwned.size) {
        for (let added of newOwned)
            addOwnedValue(owner, added)
        return
    }

    if (!newOwned.size) {
        for (let removed of oldOwned)
            removeOwnedValue(owner, removed)
        return
    }

    for (let removed of oldOwned) {
        if (!newOwned.has(removed))
            removeOwnedValue(owner, removed)
    }

    for (let added of newOwned) {
        if (!oldOwned.has(added))
            addOwnedValue(owner, added)
    }
}

function collectOwnedValues(value: unknown): Set<OwnedValue> {
    if (!value || typeof value != 'object')
        return new Set()

    let owned = new Set<OwnedValue>()

    addOwnedValueCandidate(value, owned)

    if (isModel(value))
        return owned

    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++)
            addOwnedValueCandidate(value[index], owned)
    } else {
        for (let key in value) {
            if (!Object.hasOwn(value, key))
                continue

            addOwnedValueCandidate((value as Record<string, unknown>)[key], owned)
        }
    }

    return owned
}

function addOwnedValueCandidate(value: unknown, owned: Set<OwnedValue>) {
    if (isTrackable(value) || isModel(value))
        owned.add(value)
}

function addOwnedValue(owner: Owner, owned: OwnedValue) {
    if (isTrackable(owned)) {
        addTrackableOwner(owned, owner)
        return
    }

    addModelOwner(owned, owner)
}

function removeOwnedValue(owner: Owner, owned: OwnedValue) {
    if (isTrackable(owned)) {
        removeTrackableOwner(owned, owner)
        return
    }

    removeModelOwner(owned, owner)
}

function addModelOwner(model: Model, owner: Owner) {
    let owners = ownedValueOwners.get(model)
    if (!owners) {
        owners = new Set()
        ownedValueOwners.set(model, owners)
    }

    if (!owners.size) {
        let ownedValues = collectOwnedValuesInModel(model)
        modelOwnedValues.set(model, ownedValues)

        for (let owned of ownedValues)
            addTrackableOwner(owned, model)
    }

    owners.add(owner)
}

function removeModelOwner(model: Model, owner: Owner) {
    let owners = ownedValueOwners.get(model)
    if (!owners)
        return

    owners.delete(owner)
    if (!owners.size) {
        let ownedValues = modelOwnedValues.get(model)
        if (ownedValues) {
            for (let owned of ownedValues)
                removeTrackableOwner(owned, model)
            modelOwnedValues.delete(model)
        }

        ownedValueOwners.delete(model)
    }
}

function collectOwnedValuesInModel(value: Model): Set<Trackable> {
    let owned = new Set<Trackable>()

    for (let key in value) {
        if (!Object.hasOwn(value, key))
            continue

        let item = (value as Record<string, unknown>)[key]
        if (item == value)
            continue

        if (isTrackable(item))
            owned.add(item)
    }

    return owned
}

export function isTrackable(value: unknown): value is Trackable {
    return !!value
        && typeof value == 'object'
        && dispose in (value as object)
}
