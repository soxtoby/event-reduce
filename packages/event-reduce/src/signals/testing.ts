import { isObject } from "../utils"
import { Atom } from "./atom"
import { Derivation } from "./derivation"
import { event } from "./events"
import { isModel, modelProperties } from "./nodes"
import { Reduction } from "./reduction"
import { isSource, SourceBase } from "./signals"

export function mutable<T>(model: T): Mutable<T> {
    if (isModel(model)) {
        let properties = model[modelProperties]

        for (let key in properties) {
            let property = properties[key]
            if (isSource(property)) {
                Object.defineProperty(model, key, {
                    get() { return (property as SourceBase<any>).value },
                    set(value) {
                        if (property instanceof Reduction || property instanceof Derivation)
                            property.detach()

                        if (property instanceof SourceBase)
                            property.setValue(value)
                    },
                    enumerable: Object.getOwnPropertyDescriptor(model, key)?.enumerable ?? true,
                    configurable: true
                })
            }
        }

        if (!('target' in model))
            Object.defineProperty(model, 'target', { value: model, configurable: true })
    }
    return model as Mutable<T>
}

export function modelProxy<T extends object>(initialState: T): Mutable<T>
export function modelProxy<T extends object = any>(): Mutable<T>
export function modelProxy<T extends object>(model: T = {} as T) {
    if (!isObject(model) || Array.isArray(model))
        return model

    let properties = {} as Record<PropertyKey, Atom<any>>

    // Pre-populate observable values with plain value fields
    Object.entries(Object.getOwnPropertyDescriptors(model))
        .forEach(([key, prop]) => {
            if ('value' in prop)
                properties[key] = new Atom(String(key), prop.value)
        })

    let proxy: T = new Proxy(model, {
        get(target: T, key: PropertyKey, receiver: T) {
            if (key == 'target' && !('target' in target))
                return proxy

            if (properties.hasOwnProperty(key))
                return properties[key as string].value

            if (key in target)
                return Reflect.get(target, key, receiver)

            return getOrAddObservableValue(key).value
        },

        set(target: T, key: PropertyKey, value: any) {
            if (key == 'target')
                return false

            getOrAddObservableValue(key).setValue(value)
            return true
        },

        ownKeys(target: T) {
            return Array.from(new Set(Object.keys(target).concat(Object.keys(properties))))
        },

        has(target: T, key: PropertyKey) {
            return key in target
                || key in properties
        }
    })

    return proxy

    function getOrAddObservableValue(key: PropertyKey): Atom<any> {
        return properties[String(key)] ??= new Atom(String(key), model[key as keyof T])
    }
}

export type Mutable<T> =
    & { -readonly [P in keyof T]: T[P] }
    & (T extends { target: any }
        ? {}
        : {
            /** The model proxy as the original type */
            readonly target: T
        })

export function eventProxy<T = any>(): T
export function eventProxy<TEvent extends (...args: any[]) => void>(createEvent: () => TEvent): { [key: string]: TEvent }
export function eventProxy<TEvent extends (...args: any[]) => void, T = any>(createEvent: () => TEvent): T & { [P in keyof T]: TEvent }
export function eventProxy(createEvent: () => any = event) {
    let event = createEvent()
    return new Proxy(event, {
        get(target: any, key: PropertyKey) {
            if (typeof key == 'string')
                return target[key] || (target[key] = eventProxy(createEvent))
        },

        apply(target: any, thisArg: any, argArray?: any) {
            event(...argArray)
        }
    })
}