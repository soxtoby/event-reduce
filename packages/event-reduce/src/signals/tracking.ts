import { Source } from "./signals"

export const addSourceOwner = Symbol('add source owner')
export const removeSourceOwner = Symbol('remove source owner')

export const modelBrand = Symbol('signal model')

export type Trackable = object & {
    [addSourceOwner](owner: Owner): void
    [removeSourceOwner](owner: Owner): void
}

export type Model = Trackable & { [modelBrand]: true }
export type Owner = Source<any> | Model

let ownerStack: Owner[] = []

let modelOwners = new WeakMap<Model, Set<Owner>>()

let modelOwnedValues = new WeakMap<Model, Set<Trackable>>()

export function asModel<T extends object>(value: T): T & Model {
    let model = value as T & Model

    if (!(addSourceOwner in model)) {
        Object.defineProperty(model, addSourceOwner, {
            value: (owner: Owner) => addModelOwner(model, owner),
            enumerable: false,
            configurable: false,
            writable: false
        })
    }

    if (!(removeSourceOwner in model)) {
        Object.defineProperty(model, removeSourceOwner, {
            value: (owner: Owner) => removeModelOwner(model, owner),
            enumerable: false,
            configurable: false,
            writable: false
        })
    }

    Object.defineProperty(value, modelBrand, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false
    })

    return value as T & Model
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
    let oldOwned = collectOwnedValues(previousValue)
    let newOwned = collectOwnedValues(nextValue)

    for (let removed of oldOwned.difference(newOwned))
        removeOwnedValue(owner, removed)

    for (let added of newOwned.difference(oldOwned))
        addOwnedValue(owner, added)
}

function collectOwnedValues(value: unknown): Set<Trackable> {
    let owned = new Set<Trackable>()

    addOwnedValueCandidate(value, owned)

    if (isModel(value))
        return owned

    if (Array.isArray(value)) {
        for (let item of value)
            addOwnedValueCandidate(item, owned)
    } else if (value && typeof value == 'object') {
        for (let item of Object.values(value))
            addOwnedValueCandidate(item, owned)
    }

    return owned
}

function collectOwnedValuesInModel(value: Model): Set<Trackable> {
    let owned = new Set<Trackable>()

    for (let item of Object.values(value)) {
        if (item == value)
            continue

        if (isTrackable(item))
            owned.add(item)
    }

    return owned
}

function addOwnedValueCandidate(value: unknown, owned: Set<Trackable>) {
    if (isTrackable(value))
        owned.add(value)
}

function addOwnedValue(owner: Owner, owned: Trackable) {
    owned[addSourceOwner](owner)
}

function removeOwnedValue(owner: Owner, owned: Trackable) {
    owned[removeSourceOwner](owner)
}

function addModelOwner(model: Model, owner: Owner) {
    let owners = modelOwners.get(model)
    if (!owners) {
        owners = new Set()
        modelOwners.set(model, owners)
    }

    if (!owners.size) {
        let ownedValues = collectOwnedValuesInModel(model)
        modelOwnedValues.set(model, ownedValues)

        for (let owned of ownedValues)
            owned[addSourceOwner](model)
    }

    owners.add(owner)
}

function removeModelOwner(model: Model, owner: Owner) {
    let owners = modelOwners.get(model)
    if (!owners)
        return

    owners.delete(owner)
    if (!owners.size) {
        let ownedValues = modelOwnedValues.get(model)
        if (ownedValues) {
            for (let owned of ownedValues)
                owned[removeSourceOwner](model)
            modelOwnedValues.delete(model)
        }

        modelOwners.delete(model)
    }
}

function isTrackable(value: unknown): value is Trackable {
    return !!value
        && typeof value == 'object'
        && addSourceOwner in (value as object)
        && removeSourceOwner in (value as object)
}

function isModel(value: unknown): value is Model {
    return !!value
        && typeof value == 'object'
        && modelBrand in (value as object)
}
