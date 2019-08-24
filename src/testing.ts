import { derive } from "./derivation";
import { event } from "./events";
import { ObservableValue } from "./observableValue";

export function mutable<T>(model: T): Mutable<T> {
    if (model && typeof model == 'object' && !Array.isArray(model)) {
        let overrides = new ObservableBox<Record<string, unknown>>('(overrides)', {});
        for (let [key, base] of allProperties(model)) {
            let propertyValue = derive(
                () => key in overrides.value ? overrides.value[key]
                    : base.get ? base.get.call(model)
                        : base.value, key);

            Object.defineProperty(model, key, {
                get() { return propertyValue.value; },
                set(value) { overrides.value = { ...overrides.value, [key]: value }; },
                enumerable: base.enumerable,
                configurable: true
            });
        }

        Object.defineProperty(model, 'readonly', { get: () => model, configurable: true });
    }
    return model as Mutable<T>;
}

class ObservableBox<T> extends ObservableValue<T> {
    set value(val: T) {
        this._value = val;
        this.notifyObservers(val);
    }
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
export function eventProxy<TEvent extends (...args: any[]) => void>(createEvent: () => TEvent): { [key: string]: TEvent };
export function eventProxy<TEvent extends (...args: any[]) => void, T = any>(createEvent: () => TEvent): T & { [P in keyof T]: TEvent };
export function eventProxy(createEvent: () => any = event) {
    let event = createEvent();
    return new Proxy({}, {
        get(target: any, key: PropertyKey) {
            if (typeof key == 'string')
                return target[key] || (target[key] = eventProxy(createEvent));
        },

        apply(target: any, thisArg: any, argArray?: any) {
            event(...argArray);
        }
    });
}