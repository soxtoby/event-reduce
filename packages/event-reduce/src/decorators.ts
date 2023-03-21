import { Derivation, derive } from "./derivation";
import { IEventBase } from "./events";
import { getUnderlyingObservable, ObservableValue, ValueIsNotObservableError } from "./observableValue";
import { reduce, Reduction } from "./reduction";
import { getOrAdd, isObject } from "./utils";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    return observableValueProperty(target, key, Reduction, true, () => new InvalidReducedPropertyError(key));
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

    return observableValueProperty(target, key, Derivation, false, () => new InvalidDerivedPropertyError(key));
}

function observableValueProperty<Type extends ObservableValue<any>>(
    prototype: any,
    key: string | symbol,
    type: new (...args: any) => Type,
    enumerable: boolean,
    createInvalidPropertyError: () => Error
): PropertyDescriptor {

    setObservableProperty(prototype, key, instance => {
        let value = getOrAddObservableValues(instance)[key as string];
        if (!value)
            throw createInvalidPropertyError();
        return value;
    });

    return { set };

    function set(this: any, value: any) {
        let observableValue = getUnderlyingObservable(value);
        if (!observableValue || !(observableValue instanceof type))
            throw createInvalidPropertyError();
        observableValue.displayName = String(key);
        observableValue.container = this;
        getOrAddObservableValues(this)[key as string] = observableValue;
        Object.defineProperty(this, key, {
            get: () => observableValue!.value,
            set,
            enumerable,
            configurable: true
        });
    }
}

export function extend<T>(reducedValue: T) {
    let source = getUnderlyingObservable(reducedValue);
    if (source && source instanceof Reduction)
        return reduce(reducedValue).on(source, (_, val) => val);
    throw new ValueIsNotObservableError(reducedValue);
}

let observableProperties = Symbol('ObservableProperties');
let observableValues = Symbol('ObservableValues');

function setObservableProperty(prototype: any, key: string | symbol, getObservableValue: (instance: any) => ObservableValue<any>) {
    return getOrAddObservableProperties(prototype)[key as string] = getObservableValue;
}

export function getOrSetObservableValue(instance: any, key: string | symbol, createObservableValue: () => ObservableValue<any>) {
    return getOrAdd(getOrAddObservableValues(instance), key, () => Object.assign(createObservableValue(), { container: instance }));
}

function getOrAddObservableValues(instance: any) {
    return getOrAdd(instance, observableValues, () => ({} as Record<string, ObservableValue<any>>));
}

export function getObservableValues(instance: any) {
    return isObject(instance)
        ? instance[observableValues] as Record<string, ObservableValue<any>> | undefined
        : undefined;
}

export function getObservableProperty(prototype: any, key: string) {
    return (getObservableProperties(prototype) || {})[key];
}

function getOrAddObservableProperties(prototype: any) {
    return getOrAdd<Record<string | symbol, (instance: any) => ObservableValue<any>>>(prototype, observableProperties,
        base => base ? Object.create(base) : {});
}

export function getObservableProperties(prototype: any) {
    return prototype[observableProperties] as Record<string, (instance: any) => ObservableValue<any>> | undefined;
}

export let events = <T extends { new(...args: any[]): any }>(target: T): T => {
    const className = (target as any).displayName || target.name;
    return {
        [className]: class extends target {
            constructor(...args: any[]) {
                super(...args);
                Object.keys(this).forEach(key => {
                    let prop = this[key];
                    if (hasDisplayName(prop)) {
                        prop.displayName = key;
                        prop.container = this;
                    }
                });
            }
        }
    }[className];
}

function hasDisplayName(e: any): e is IEventBase {
    return e instanceof Object
        && 'displayName' in e;
}

export class InvalidReducedPropertyError extends Error {
    constructor(
        public property: string | symbol
    ) {
        super(`@reduced property '${String(property)}' can only be set to the value of a reduction`);
    }
}

export class InvalidDerivedPropertyError extends Error {
    constructor(
        public property: string | symbol
    ) {
        super(`@derived property ${String(property)} must have a getter or be set to the value of a derivation`);
    }
}