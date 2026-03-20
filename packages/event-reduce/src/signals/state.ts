import { isObject } from "../utils"

export type State<T> = T extends { toJSON(): infer S } ? S : T

export function getState<T>(model: T): State<T> {
    return isObject(model) && typeof (model as any).toJSON == 'function'
        ? (model as any).toJSON()
        : model as State<T>
}