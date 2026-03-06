import { isObject } from "../utils"

export type State<T> = T extends { toJSON(): infer S } ? S : T

export function getState<T>(model: T): State<T> {
    return isObject(model) && 'toJSON' in model
        ? (model as any).toJSON()
        : model as State<T>
}