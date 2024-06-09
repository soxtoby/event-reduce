import { event } from "./events";
import { getObservableValue } from "./models";
import { ObservableValue } from "./observableValue";
import { getAllPropertyDescriptors, isObject } from "./utils";

export function mutable<T>(model: T): Mutable<T> {
    if (isObject(model) && !Array.isArray(model)) {
        for (let [key, base] of getAllPropertyDescriptors(model)) {
            let observableValue = getObservableValue(model, key)!;

            if (observableValue) {
                Object.defineProperty(model, key, {
                    get() { return observableValue.value; },
                    set(value) {
                        observableValue.unsubscribeFromSources();
                        observableValue.setValue(value);
                    },
                    enumerable: base.enumerable,
                    configurable: true
                });
            }
        }

        if (!('target' in model))
            Object.defineProperty(model, 'target', { get: () => model, configurable: true });
    }
    return model as Mutable<T>;
}

export function modelProxy<T extends object>(initialState: T): Mutable<T>;
export function modelProxy<T extends object = any>(): Mutable<T>;
export function modelProxy<T extends object>(model: T = {} as T) {
    if (!isObject(model) || Array.isArray(model))
        return model;

    let observableValues = {} as Record<PropertyKey, ObservableValue<any>>;

    // Pre-populate observable values with plain value fields
    Object.entries(Object.getOwnPropertyDescriptors(model))
        .forEach(([key, prop]) => {
            if ('value' in prop)
                observableValues[key] = new ObservableValue(() => String(key), prop.value);
        });

    let proxy: T = new Proxy(model, {
        get(target: T, key: PropertyKey, receiver: T) {
            if (key == 'target' && !('target' in target)
            ) {
                return proxy;
            }

            if (observableValues.hasOwnProperty(key))
                return observableValues[key as string].value;

            if (key in target)
                return Reflect.get(target, key, receiver);

            return getOrAddObservableValue(key).value;
        },

        set(target: T, key: PropertyKey, value: any) {
            if (key == 'target' || key == 'readonly')
                return false;

            getOrAddObservableValue(key).setValue(value);
            return true;
        },

        ownKeys(target: T) {
            return Array.from(new Set(Object.keys(target).concat(Object.keys(observableValues))));
        },

        has(target: T, key: PropertyKey) {
            return key in target
                || key in observableValues;
        }
    });

    return proxy;

    function getOrAddObservableValue(key: PropertyKey): ObservableValue<any> {
        return observableValues[key as string] || (observableValues[key as string] = new ObservableValue(() => String(key), model[key as keyof T]));
    }
}

export type Mutable<T> =
    & { -readonly [P in keyof T]: T[P] }
    & (T extends { target: any }
        ? {}
        : {
            /** The model proxy as the original type */
            readonly target: T;
        })

export function eventProxy<T = any>(): T;
export function eventProxy<TEvent extends (...args: any[]) => void>(createEvent: () => TEvent): { [key: string]: TEvent };
export function eventProxy<TEvent extends (...args: any[]) => void, T = any>(createEvent: () => TEvent): T & { [P in keyof T]: TEvent };
export function eventProxy(createEvent: () => any = event) {
    let event = createEvent();
    return new Proxy(event, {
        get(target: any, key: PropertyKey) {
            if (typeof key == 'string')
                return target[key] || (target[key] = eventProxy(createEvent));
        },

        apply(target: any, thisArg: any, argArray?: any) {
            event(...argArray);
        }
    });
}