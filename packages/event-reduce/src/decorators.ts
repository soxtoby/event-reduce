import { Derivation, derive } from "./derivation";
import { IEventBase } from "./events";
import { consumeLastAccessed, ObservableValue, withInnerTrackingScope } from "./observableValue";
import { reduce, Reduction } from "./reduction";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    return observableValueProperty(target, key, Reduction, true, `@reduced property '${String(key)}' can only be set to the value of a reduction`);
}

export let derived: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    let property = Object.getOwnPropertyDescriptor(target, key)!;

    if (property && property.get) {
        let getObservableValue = (instance: any) => getOrSetObservableValue(instance, key, () => derive(property.get!.bind(instance), String(key)));
        setObservableProperty(target, key, getObservableValue);
        return {
            get() { return getObservableValue(this).value; },
            configurable: true
        }
    }

    return observableValueProperty(target, key, Derivation, false, `@derived property ${String(key)} must have a getter or be set to the value of a derivation`);
}

function observableValueProperty<Type extends ObservableValue<any>>(
    prototype: any,
    key: string | symbol,
    type: new (...args: any) => Type,
    enumerable: boolean,
    typeError: string
): PropertyDescriptor {

    setObservableProperty(prototype, key, instance => {
        let value = getOrAddObservableValues(instance)[key as string];
        if (!value)
            throw new Error(typeError);
        return value;
    });

    return { set };

    function set(this: any, value: any) {
        let observableValue = consumeLastAccessed()!;
        if (!observableValue || !(observableValue instanceof type) || value !== withInnerTrackingScope(() => observableValue.value))
            throw new Error(typeError);
        observableValue.displayName = String(key);
        observableValue.container = this;
        getOrAddObservableValues(this)[key as string] = observableValue;
        Object.defineProperty(this, key, {
            get: () => observableValue.value,
            set,
            enumerable,
            configurable: true
        });
    }
}

export function extend<T>(reducedValue: T) {
    let source = consumeLastAccessed() as Reduction<T>;
    if (source && source instanceof Reduction && withInnerTrackingScope(() => source.value) == reducedValue)
        return reduce(reducedValue)
            .onValueChanged(source.value, (_, val) => val);
    throw new Error("Couldn't detect reduced value. Make sure you pass in the value of a reduction directly.");
}

let observableProperties = Symbol('ObservableProperties');
let observableValues = Symbol('ObservableValues');

function setObservableProperty(prototype: any, key: string | symbol, getObservableValue: (instance: any) => ObservableValue<any>) {
    return getOrAddObservableProperties(prototype)[key as string] = getObservableValue;
}

function getOrSetObservableValue(instance: any, key: string | symbol, createObservableValue: (instance: any) => ObservableValue<any>) {
    return getOrAdd(getOrAddObservableValues(instance), key, () => Object.assign(createObservableValue(instance), { container: instance }));
}

function getOrAddObservableValues(instance: any) {
    return getOrAdd(instance, observableValues, () => ({} as Record<string, ObservableValue<any>>));
}

export function getObservableProperty(prototype: any, key: string) {
    return (getObservableProperties(prototype) || {})[key];
}

function getOrAddObservableProperties(prototype: any) {
    return getOrAdd(prototype, observableProperties, () => ({} as Record<string | symbol, (instance: any) => ObservableValue<any>>));
}

export function getObservableProperties(prototype: any) {
    return prototype[observableProperties] as Record<string, (instance: any) => ObservableValue<any>> | undefined;
}

function getOrAdd<T>(target: any, key: string | symbol, create: () => T): T {
    return target[key] || (target[key] = create());
}

export let events = <T extends { new(...args: any[]): any }>(target: T): T => {
    const className = (target as any).displayName || target.name;
    return {
        [className]: class extends target {
            constructor(...args: any[]) {
                super(...args);
                Object.keys(this).forEach(key => {
                    let prop = this[key];
                    if (isObservableEvent(prop)) {
                        prop.displayName = key;
                        prop.container = this;
                    }
                });
            }
        }
    }[className];
}

function isObservableEvent(e: any): e is IEventBase {
    return typeof e === 'function'
        && e.displayName;
}
