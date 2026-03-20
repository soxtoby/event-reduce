import { dispose, isObject } from "../utils"
import { ISource } from "./signals"
import { getState } from "./state"
import { updateChildren } from "./tracking"

export const modelProperties = Symbol('model properties')
export const eventsBrand = Symbol('events class')

export interface Model extends Disposable {
    [modelProperties]: Record<PropertyKey, ModelProperty>
}

export type ModelProperty = ISource<any> | StateProperty

export interface EventsClass {
    [eventsBrand]: true
}

export function isModel(value: unknown): value is Model {
    return isObject(value)
        && modelProperties in value
}

export function isEventsClass(value: unknown): value is EventsClass {
    return value instanceof Object
        && eventsBrand in value
}

export class StateProperty implements Disposable {
    constructor(
        private _instance: any,
        public readonly key: PropertyKey
    ) {
        updateChildren(_instance, null, this.value)
    }

    toJSON() { return getState(this.value) }

    get value() { return this._instance[this.key] }

    [dispose]() {
        updateChildren(this._instance, this.value, null)
    }
}