import { changeOwnedValue } from "./cleanup";
import { Derivation, derive } from "./derivation";
import { IEventBase } from "./events";
import { ObservableValue, ValueIsNotObservableError, getUnderlyingObservable, startTrackingScope } from "./observableValue";
import { Reduction, reduce } from "./reduction";
import { StringKey } from "./types";
import { getOrAdd, isObject, isPlainObject, nameOfFunction } from "./utils";

const stateProperties = Symbol('StateProperties');
const observableProperties = Symbol('ObservableProperties');
const observableValues = Symbol('ObservableValues');

/** 
 * Marks a class as a model.
 * Observable values accessed during construction will not be tracked.
 * The model instance will take ownership of all observable and state properties.
 **/
export function model<T extends { new(...args: any[]): any }>(target: T): T {
    getOrAddObservableProperties(target.prototype);
    const className = nameOfFunction(target);
    return {
        [className]: class extends target {
            constructor(...args: any[]) {
                let endScope = startTrackingScope();
                try {
                    super(...args);
                } finally {
                    endScope();
                }

                for (let value of Object.values(getObservableValues(this)))
                    changeOwnedValue(this, undefined, value)

                for (let key of getStateProperties(this))
                    changeOwnedValue(this, undefined, this[key]);
            }
        }
    }[className];
}

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    return observableValueProperty(target, key, Reduction, () => new InvalidReducedPropertyError(key));
}

export function derived(valuesEqual: (previous: any, next: any) => boolean): PropertyDecorator;
export function derived(target: Object, key: string | symbol): void;
export function derived(targetOrValuesEqual: Object | ((previous: any, next: any) => boolean), key?: string | symbol): PropertyDecorator | void {
    let valuesEqual = typeof targetOrValuesEqual == 'function'
        ? targetOrValuesEqual as (previous: any, next: any) => boolean
        : undefined;

    return valuesEqual
        ? decorate as PropertyDecorator
        : decorate(targetOrValuesEqual, key!) as any 

    function decorate(target: Object, key: string | symbol) {
        let property = Object.getOwnPropertyDescriptor(target, key)!;

        if (property && property.get) {
            let getObservableValue = (instance: any) => getOrSetObservableValue(instance, key, () => derive(property.get!.bind(instance), String(key), valuesEqual));
            setObservableProperty(target, key, getObservableValue);
            return {
                get() { return getObservableValue(this).value; },
                enumerable: true,
                configurable: true
            }
        }

        return observableValueProperty(target, key, Derivation, () => new InvalidDerivedPropertyError(key));
    }
}

function observableValueProperty<Type extends ObservableValue<any>>(
    prototype: any,
    key: string | symbol,
    type: new (...args: any) => Type,
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
            enumerable: true,
            configurable: true
        });
    }
}

/** Mark a constructor parameter as a state property by specifying its name. */
export function state(parameterName: string): (target: Function, key: any, index: number) => void;
/** Mark a property as a state property. */
export function state(target: any, key: string): void;
export function state(paramNameOrTarget: any, key?: string) {
    if (typeof paramNameOrTarget == 'string')
        return (constructor: Function, key: any, index: number) => addStateProp(constructor.prototype, paramNameOrTarget);

    addStateProp(paramNameOrTarget.constructor.prototype, key!);
}

function addStateProp(prototype: any, key: string) {
    getOrAdd(prototype, stateProperties, () => [] as string[])
        .push(key);
}

export function isModel<T>(model: T): model is T & object {
    return isObject(model)
        && (!!getObservableProperties(Object.getPrototypeOf(model))
            || !!getStateProperties(model).length);
}

export function extend<T>(reducedValue: T) {
    let source = getUnderlyingObservable(reducedValue);
    if (source && source instanceof Reduction)
        return reduce(reducedValue).on(source.values, (_, val) => val);
    throw new ValueIsNotObservableError(reducedValue);
}

function setObservableProperty(prototype: any, key: string | symbol, getObservableValue: (instance: any) => ObservableValue<any>) {
    return getOrAddObservableProperties(prototype)[key as string] = getObservableValue;
}

export function getOrSetObservableValue(instance: any, key: string | symbol, createObservableValue: () => ObservableValue<any>) {
    return getOrAdd(getOrAddObservableValues(instance), key, () => Object.assign(createObservableValue(), { container: instance }));
}

function getOrAddObservableValues(instance: any) {
    return getOrAdd(instance, observableValues, () => ({} as Record<string, ObservableValue<any>>));
}

export function getObservableValues(instance: any): { [property: string]: ObservableValue<unknown> } {
    return isObject(instance) && observableValues in instance
        ? instance[observableValues]
        : {};
}

export function getObservableProperty(prototype: any, key: string) {
    let observableProperties = getObservableProperties(prototype) || {};
    return Object.hasOwn(observableProperties, key)
        ? observableProperties[key]
        : undefined;
}

function getOrAddObservableProperties(prototype: any) {
    return getOrAdd<Record<string | symbol, (instance: any) => ObservableValue<any>>>(prototype, observableProperties,
        base => base ? Object.create(base) : {});
}

export function getObservableProperties(prototype: any) {
    return prototype[observableProperties] as Record<string, (instance: any) => ObservableValue<any>> | undefined;
}

export function getStateProperties<T>(model: T): string[] {
    if (isPlainObject(model))
        return [];

    let prototype = Object.getPrototypeOf(model);
    return getStateProperties(prototype)
        .concat(prototype[stateProperties] as StringKey<T>[] | undefined || []);
}

/**
 * Marks a class as an events class.
 * Automatically populates the names of event properties.
 */
export let events = <T extends { new(...args: any[]): any }>(target: T): T => {
    const className = nameOfFunction(target);
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