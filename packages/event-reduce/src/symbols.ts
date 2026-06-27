import { isObject } from "./utils"

const eventBrand = Symbol('event')
const eventsBrand = Symbol('events class')

export const modelBrand = Symbol('model class')
export const modelProperties = Symbol('model properties')

export const statePropertyBrand = Symbol('state property')

export interface Model extends Disposable {
    [modelProperties]: Record<PropertyKey, any>
}

export interface EventsClass {
    [eventsBrand]: true
}

export interface StatePropertyBrand {
    [statePropertyBrand]: true
    key: PropertyKey
    value: unknown
}

export function markEvent(value: Function) {
    (value as any)[eventBrand] = true
}

export function isEvent(value: any): value is Function {
    return typeof value == 'function'
        && eventBrand in value
}

export function markEventsClass(value: object) {
    (value as any)[eventsBrand] = true
}

export function isEventsClass(value: unknown): value is EventsClass {
    return isObject(value)
        && eventsBrand in value
}

export function isModel(value: unknown): value is Model {
    return isObject(value)
        && modelProperties in value
}

export function isStateProperty(value: unknown): value is StatePropertyBrand {
    return isObject(value)
        && statePropertyBrand in value
}
