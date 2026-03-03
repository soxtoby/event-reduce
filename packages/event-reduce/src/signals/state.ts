import { dispose, isObject } from "../utils"

export type State<T> = T

export let serializeDerivedValues = false

export function derivedValuedSerialization() {
    let previous = serializeDerivedValues
    return { [dispose]() { serializeDerivedValues = previous } }
}

export function getState<T>(model: T): State<T> {
    return isObject(model) && 'toJSON' in model
        ? (model as any).toJSON()
        : model
}