import { event, IObservableEvent } from "./events";
import { observable, computed } from "mobx";

export function mutable<T>(model: T): Mutable<T> {
    if (model && typeof model == 'object' && !Array.isArray(model)) {
        let overrides = observable(new Map<string, unknown>(), { deep: false });
        for (let [key, base] of allProperties(model)) {
            let computedValue = computed(
                () => overrides.has(key) ? overrides.get(key)
                    : base.get ? base.get.call(model)
                        : base.value,
                {
                    name: key,
                    set(value) { overrides.set(key, mutable(value)); }
                });
            Object.defineProperty(model, key, {
                get() { return computedValue.get(); },
                set(value) { computedValue.set(value); },
                enumerable: base.enumerable,
                configurable: true
            });
        }

        Object.defineProperty(model, 'readonly', { get: () => model, configurable: true });
    }
    return model as Mutable<T>;
}

function allProperties(obj: unknown) {
    let props = new Map<string, PropertyDescriptor>();
    while (obj != Object.prototype) {
        Object.entries(Object.getOwnPropertyDescriptors(obj))
            .filter(([key]) => !props.has(key))
            .forEach(([key, property]) => props.set(key, property));
        obj = Object.getPrototypeOf(obj);
    }
    return props;
}

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P]
} & {
    /** The model as the original type */
    readonly readonly: T;
}

export function eventProxy<T = any>(): T;
export function eventProxy<TEvent extends IObservableEvent<any>>(createEvent: () => TEvent): { [key: string]: TEvent };
export function eventProxy<TEvent extends IObservableEvent<any>, T = any>(createEvent: () => TEvent): T & { [P in keyof T]: TEvent };
export function eventProxy(createEvent: () => IObservableEvent<any> = event) {
    return new Proxy({}, {
        get(target: any, key: PropertyKey) {
            if (typeof key == 'string')
                return target[key] || (target[key] = createEvent());
        },
        getPrototypeOf() {
            // Stop mobx from turning events into observables
            return {};
        }
    });
}