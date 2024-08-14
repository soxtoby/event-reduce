import { changeOwnedValue } from "./cleanup";
import { Derivation, derive } from "./derivation";
import { isEvent } from "./events";
import { ObservableValue, ValueIsNotObservableError, getUnderlyingObservable, startTrackingScope } from "./observableValue";
import { Reduction, reduce } from "./reduction";
import { StringKey } from "./types";
import { emptyArray, getAllPropertyDescriptors, getOrAdd, isObject, isPlainObject, nameOfFunction } from "./utils";

const StateProperties = Symbol('StateProperties');
const ObservableValueFactories = Symbol('ObservableValueFactories');
const ObservableValues = Symbol('ObservableValues');

/** 
 * Marks a class as a model.
 * Initializes \@{@link reduced} and \@{@link derived} properties.
 * Observable values accessed during construction will not be tracked.
 * The model instance will take ownership of all observable and state properties.
 **/
export function model<T extends { new(...args: any[]): any }>(target: T): T {
    let observableValueFactories = getOrAddObservableValueFactories(target.prototype);
    const className = nameOfFunction(target);
    return {
        [className]: class extends target {
            constructor(...args: any[]) {
                let endScope = startTrackingScope();
                try {
                    super(...args);

                    let observableValues = getOrAddObservableValues(this);
                    for (let key of Object.getOwnPropertyNames(observableValueFactories)) // Super class could have its own value factories
                        observableValues[key] = defineObservableProperty(this, key, observableValueFactories[key]);
                } finally {
                    endScope();
                }

                for (let value of Object.values(getObservableValues(this)))
                    changeOwnedValue(this, undefined, value);

                for (let key of getStateProperties(this)) {
                    let value = this[key];
                    if (process.env.NODE_ENV !== 'production') {
                        if (isEvent(value) || isEventsClass(value))
                            throw new EventsMarkedAsStateError(this, key);
                    }
                    changeOwnedValue(this, undefined, this[key]);
                }
            }
        }
    }[className];
}

function defineObservableProperty(model: any, key: string, createObservableValue: (instance: any) => ObservableValue<any>) {
    let observableValue = createObservableValue(model);
    observableValue.container = model;
    Object.defineProperty(model, key, {
        get() { return observableValue.value; },
        enumerable: true,
        configurable: true
    });
    return observableValue;
}

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    let property = Object.getOwnPropertyDescriptor(target, key)!;

    if (property?.get) {
        let getter = property.get;
        let createReduction = (instance: any) => {
            let observableValue = getUnderlyingObservable(getter.call(instance));
            if (!(observableValue instanceof Reduction))
                throw new InvalidReducedPropertyError(key);
            return observableValue;
        }
        setObservableValueFactory(target, key, createReduction);
        return {
            get() {
                let observableValue = getObservableValue(this, key as string);
                if (!observableValue)
                    throw new MissingModelDecoratorError(this, key);
                return observableValue.value;
            },
            enumerable: true,
            configurable: true
        };
    }

    return observableValueProperty(key, Reduction, () => new InvalidReducedPropertyError(key));
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

        if (property?.get) {
            let getter = property.get;
            let createDerivation = (instance: any) => derive(getter.bind(instance), String(key), valuesEqual);
            setObservableValueFactory(target, key, createDerivation);
            return {
                get() { return getOrSetObservableValue(this, key, () => createDerivation(this)).value; },
                enumerable: true,
                configurable: true
            }
        }

        return observableValueProperty(key, Derivation, () => new InvalidDerivedPropertyError(key));
    }
}

function observableValueProperty<Type extends ObservableValue<any>>(
    key: string | symbol,
    type: new (...args: any) => Type,
    createInvalidPropertyError: () => Error
): PropertyDescriptor {
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
    getOrAdd(prototype, StateProperties, () => [] as string[])
        .push(key);
}

export function isModel<T>(model: T): model is T & object {
    return isObject(model)
        && (ObservableValues in model
            || !!getStateProperties(model).length);
}

export function extend<T>(reducedValue: T) {
    let source = getUnderlyingObservable(reducedValue);
    if (source && source instanceof Reduction)
        return reduce(reducedValue).on(source, (_, val) => val);
    throw new ValueIsNotObservableError(reducedValue);
}

function setObservableValueFactory(prototype: any, key: string | symbol, createObservableValue: (instance: any) => ObservableValue<any>) {
    return getOrAddObservableValueFactories(prototype)[key as string] = createObservableValue;
}

export function getOrSetObservableValue(instance: any, key: string | symbol, createObservableValue: () => ObservableValue<any>) {
    return getOrAdd(getOrAddObservableValues(instance), key, () => Object.assign(createObservableValue(), { container: instance }));
}

function getOrAddObservableValues(instance: any) {
    return getOrAdd(instance, ObservableValues, () => ({} as Record<string, ObservableValue<any>>));
}

export function getObservableValue(instance: any, key: string) {
    let observableValues = getObservableValues(instance);
    return Object.hasOwn(observableValues, key)
        ? observableValues[key]
        : undefined;
}

export function getObservableValues(instance: any): { [property: string]: ObservableValue<unknown> } {
    return isObject(instance) && ObservableValues in instance
        ? instance[ObservableValues]
        : {};
}

function getOrAddObservableValueFactories(prototype: any) {
    return getOrAdd<Record<string | symbol, (instance: any) => ObservableValue<any>>>(prototype, ObservableValueFactories,
        base => base ? Object.create(base) : {});
}

export function getStateProperties<T>(model: T): readonly string[] {
    if (isPlainObject(model))
        return emptyArray;

    let prototype = Object.getPrototypeOf(model);
    return getStateProperties(prototype)
        .concat(prototype[StateProperties] as StringKey<T>[] | undefined || emptyArray);
}

/**
 * Marks a class as an events class.
 * Automatically populates the names of event properties.
 * Events returned from getters will be snapshotted, so the getter function is only called once.
 */
export let events = <T extends { new(...args: any[]): any }>(target: T): T => {
    const className = nameOfFunction(target);
    return {
        [className]: class extends target {
            constructor(...args: any[]) {
                super(...args);
                for (let [key, property] of getAllPropertyDescriptors(this)) {
                    let value = this[key];
                    if (isEvent(value)) {
                        value.displayName = key;
                        value.container = this;
                        if (property.get)
                            Object.defineProperty(this, key, {
                                value,
                                configurable: true,
                                enumerable: true
                            });
                    }
                }
                (this as any)[eventsClassBrand] = true;
            }
        }
    }[className];
}

export function isEventsClass(value: unknown): value is Object {
    return value instanceof Object
        && eventsClassBrand in value;
}

const eventsClassBrand = Symbol('IsEventsClass');


export class MissingModelDecoratorError extends Error {
    constructor(
        public model: object,
        public property: string | symbol
    ) {
        super(`Observable property ${nameOfFunction(model.constructor)}.${String(property)} was accessed before it was initialized.
Make sure you've marked the class with @model, and that the property is defined above any @reduced properties that access it.`)
    }
}

export class EventsMarkedAsStateError extends Error {
    constructor(
        public model: object,
        public property: string | symbol
    ) {
        super(`Model property ${String(property)} returns an event or events class, and cannot be marked as @state.`);
    }
}

export class InvalidReducedPropertyError extends Error {
    constructor(
        public property: string | symbol
    ) {
        super(`@reduced property '${String(property)}' must return, or be set to, the value of a reduction.`);
    }
}

export class InvalidDerivedPropertyError extends Error {
    constructor(
        public property: string | symbol
    ) {
        super(`@derived property ${String(property)} must have a getter or be set to the value of a derivation.`);
    }
}