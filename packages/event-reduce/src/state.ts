import { ISignal, signal } from "./signal"
import { isObject } from "./utils"

export type State<T> = T extends { toJSON(): infer S }
    ? State<S>
    : (T extends object
        ? { [K in keyof T]: State<T[K]> }
        : T)

export function getState<T>(model: T, includeDerived = false): State<T> {
    return JSON.parse(stringifyState(model, includeDerived))
}

export function stringifyState<T>(model: T, includeDerived = false): string {
    let config = includeDerivedState()
    if (config.value != includeDerived)
        config.setValue(includeDerived)
    return JSON.stringify(model)
}

let includeDerivedStateSignal: ISignal<boolean> | undefined

export function includeDerivedState() {
    return includeDerivedStateSignal ??= signal(false, 'includeDerivedState')
}

export type ModelJSON<T> = T extends { toJSON(): infer S }
    ? ModelJSON<S>
    : T

export function modelJSON<T>(model: T): ModelJSON<T> {
    return isObject(model) && typeof (model as any).toJSON == 'function'
        ? (model as any).toJSON()
        : model as ModelJSON<T>
}
