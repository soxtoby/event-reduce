import { changeOwnedValue } from "./cleanup";
import { Derivation, derive } from "./derivation";
import { isEvent } from "./events";
import { ObservableValue, ValueIsNotObservableError, getUnderlyingObservable, protectionAgainstAccessingValueWithCommonSource } from "./observableValue";
import { Reduction, reduce } from "./reduction";
import { StringKey } from "./types";
import { argsAre, constant, dispose, emptyArray, getAllPropertyDescriptors, getOrAdd, isFunction, isObject, isPlainObject, isString, isUndefined, nameOfFunction } from "./utils";

const ModelClassBrand = Symbol('IsModel');
const EventsClassBrand = Symbol('IsEventsClass');
const StateProperties = Symbol('StateProperties');
const ObservablePropertyFactories = Symbol('ObservablePropertyInitializers');
const LegacyObservablePropertyFactories = Symbol('ObservableValueFactories');
const ObservableValues = Symbol('ObservableValues');

/** 
 * Marks a class as a model.
 * Initializes \@{@link reduced} and \@{@link derived} properties.
 * Observable values accessed during construction will not be tracked.
 * The model instance will take ownership of all observable and state properties.
 **/
export function model<Class extends new (...args: any[]) => any>(target: Class): Class {
    (target as any)[ModelClassBrand] = true;

    let legacyFactories = getOrAddLegacyObservablePropertyFactories(target.prototype);

    const className = nameOfFunction(target);
    return {
        [className]: class extends target {
            constructor(...args: any[]) {
                let protection = protectionAgainstAccessingValueWithCommonSource(); // Introduces new tracking scope, while still protecting against accessing values derived from the current event
                try {
                    super(...args);

                    let observableValues = getOrAddObservableValues(this);

                    // New decorators
                    let propertyFactories = getOrAddObservablePropertyFactories(this);
                    for (let key of Object.keys(propertyFactories))
                        observableValues[key] = defineObservableProperty(this, key, propertyFactories[key]);

                    // Legacy decorators
                    for (let key of Object.getOwnPropertyNames(legacyFactories)) // Super class could have its own value factories
                        observableValues[key] = defineObservableProperty(this, key, legacyFactories[key]);
                } finally {
                    protection[dispose]();
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

export function reduced<Model, Value>(accessor: ClassAccessorDecoratorTarget<Model, Value>, context: ClassAccessorDecoratorContext<Model, Value>): ClassAccessorDecoratorResult<unknown, Value>;
export function reduced<Model, Value>(getter: () => Value, context: ClassGetterDecoratorContext<Model, Value>): void;
export function reduced(prototype: object, key: string | symbol): void;
export function reduced<Value, Model extends object>(...args:
    | [ClassAccessorDecoratorTarget<unknown, Value>, ClassAccessorDecoratorContext<Model, Value>]
    | [() => Value, ClassGetterDecoratorContext<Model, Value>]
    | [Object, string | symbol]
) {
    if (argsAre(args, isClassAccessorDecoratorTarget, isClassAccessorDecoratorContext)) {
        // Auto-accessor property decorator
        let [_, context] = args;

        return {
            init(this: Model, initial: Value) {
                assertIsModel(this, context.name);

                let reduction = getUnderlyingObservable(initial);
                if (!(reduction instanceof Reduction))
                    throw new InvalidReducedPropertyError(context.name);

                getOrAddObservablePropertyFactories(this)[context.name] = constant(reduction);

                return initial;
            },
            get(this: Model) {
                return getObservableValues(this)?.[context.name as string].value as Value;
            }
        };
    } else if (argsAre(args, isFunction, isDecoratorContext)) {
        // Getter property decorator
        let [getter, context] = args;

        context.addInitializer(function (this: Model) {
            assertIsModel(this, context.name);

            getOrAddObservablePropertyFactories(this)[context.name] = getterReduction.bind(null, this, context.name, getter);
        });
    } else {
        // Legacy decorator
        let [prototype, key] = args;
        let property = Object.getOwnPropertyDescriptor(prototype, key)!;

        if (property?.get) {
            let getter = property.get;
            getOrAddLegacyObservablePropertyFactories(prototype)[key] = instance => getterReduction(instance, key, getter);
            return {
                get(this: object) {
                    let observableValue = getObservableValue(this, key as string);
                    if (!observableValue)
                        throw new MissingModelDecoratorError(this, key);
                    return observableValue.value;
                },
                enumerable: true,
                configurable: true
            };
        } else {
            return observableValueProperty(key, Reduction, () => new InvalidReducedPropertyError(key));
        }
    }
}

function getterReduction<Value>(instance: object, key: string | symbol, getter: () => Value) {
    let observableValue = getUnderlyingObservable(getter.call(instance));
    if (!(observableValue instanceof Reduction))
        throw new InvalidReducedPropertyError(key);
    return observableValue;
}

export function derived<Value>(valuesEqual: (previous: Value, next: Value) => boolean): { <Model>(getter: () => Value, context: ClassGetterDecoratorContext<Model, Value>): () => Value; (prototype: Object, key: string | symbol): void; };
export function derived<Model, Value>(getter: () => Value, context: ClassGetterDecoratorContext<Model, Value>): void;
export function derived(prototype: object, key: string | symbol): void;
export function derived<Model extends object, Value>(...args:
    | [(previous: Value, next: Value) => boolean]
    | [() => Value, ClassGetterDecoratorContext<Model, Value>]
    | [object, string | symbol]
) {
    let valuesEqual = undefined as ((previous: any, next: any) => boolean) | undefined;

    if (argsAre(args, isFunction)) {
        [valuesEqual] = args;
        return decorate;
    } else if (argsAre(args, isFunction, isDecoratorContext)) {
        return decorate(...args);
    } else {
        return decorate(...args);
    }

    function decorate<Model, Value>(getter: () => Value, context: ClassGetterDecoratorContext<Model, Value>): void;
    function decorate(prototype: object, key: string | symbol): void;
    function decorate<Model extends object, Value>(...args:
        | [() => Value, ClassGetterDecoratorContext<Model, Value>]
        | [object, string | symbol]
    ) {
        if (argsAre(args, isFunction, isDecoratorContext)) {
            // Getter property decorator
            let [getter, context] = args;
            context.addInitializer(function (this: Model) {
                assertIsModel(this, context.name);

                getOrAddObservablePropertyFactories(this)[context.name] = () => derive(getter.bind(this), String(context.name), valuesEqual);
            });
        } else {
            // Legacy decorator
            let [prototype, key] = args;
            let property = Object.getOwnPropertyDescriptor(prototype, key)!;

            if (property?.get) {
                let getter = property.get;
                let createDerivation = (instance: any) => derive(getter.bind(instance), String(key), valuesEqual);
                getOrAddLegacyObservablePropertyFactories(prototype)[key] = createDerivation;
                return {
                    get() { return getOrSetObservableValue(this, key, () => createDerivation(this)).value; },
                    enumerable: true,
                    configurable: true
                }
            }

            return observableValueProperty(key, Derivation, () => new InvalidDerivedPropertyError(key));
        }
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

export function state<Model, Value>(value: undefined, context: ClassFieldDecoratorContext<Model, Value>): void;
export function state<Model, Value>(accessor: ClassAccessorDecoratorTarget<Model, Value>, context: ClassAccessorDecoratorContext<Model, Value>): void;
/** Mark a constructor parameter as a state property by specifying its name. */
export function state<Key extends string>(property: Key): (target: Function, ...rest: any) => void; //..rest: any to support both constructor parameters and classes
/** Mark a property as a state property. */
export function state(target: object, key: string): void;
export function state<Model, Value>(...args:
    | string[]
    | [undefined, ClassFieldDecoratorContext<Model, Value>]
    | [ClassAccessorDecoratorTarget<Model, Value>, ClassAccessorDecoratorContext<Model, Value>]
    | [string]
    | [object, string]
) {
    if (argsAre(args, isObject, isString)) {
        // Legacy decorator
        let [instance, key] = args;
        addStateProp(instance.constructor.prototype, key);
    } else if (argsAre(args, isUndefined, isClassFieldDecoratorContext)) {
        // Field decorator
        let [_, context] = args;
        context.addInitializer(function (this: Model) { addStateProp(Object.getPrototypeOf(this), String(context.name)); });
    } else if (argsAre(args, isClassAccessorDecoratorTarget, isClassAccessorDecoratorContext)) {
        // Auto-accessor property decorator
        let [_, context] = args;
        context.addInitializer(function (this: Model) { addStateProp(Object.getPrototypeOf(this), String(context.name)); });
    } else {
        // Class decorator, or legacy constructor parameter decorator
        return function decorate(ctor: new (...ctorArgs: any[]) => any) {
            for (let key of args)
                addStateProp(ctor.prototype, key);
        }
    }
}

function addStateProp(prototype: any, key: string) {
    getOrAdd(prototype, StateProperties, () => [] as string[])
        .push(key);
}

function isClassFieldDecoratorContext(context: ClassFieldDecoratorContext<any, any> | unknown): context is ClassFieldDecoratorContext<any, any> {
    return isDecoratorContext(context) && context.kind == 'field';
}

function isClassAccessorDecoratorTarget(context: ClassAccessorDecoratorTarget<any, any> | unknown): context is ClassAccessorDecoratorTarget<any, any> {
    return isObject(context) && !!(context as ClassAccessorDecoratorTarget<any, any>).get;
}

function isClassAccessorDecoratorContext(context: ClassAccessorDecoratorContext<any, any> | unknown): context is ClassAccessorDecoratorContext<any, any> {
    return isDecoratorContext(context) && context.kind == 'accessor';
}

function isDecoratorContext(context: ClassMemberDecoratorContext | unknown): context is DecoratorContext {
    return isObject(context) && !!(context as ClassMemberDecoratorContext).kind;
}

function assertIsModel(model: object, propertyName: string | symbol) {
    if (!(ModelClassBrand in model.constructor))
        throw new MissingModelDecoratorError(model, propertyName);
}

export function isModel<T>(model: T): model is T & object {
    return isObject(model)
        && (ModelClassBrand in Object.getPrototypeOf(model) // TODO only check this - the other checks are for legacy decorators with legacy fields
            || ObservableValues in model
            || !!getStateProperties(model).length);
}

export function extend<T>(reducedValue: T) {
    let source = getUnderlyingObservable(reducedValue);
    if (source && source instanceof Reduction)
        return reduce(reducedValue).on(source, (_, val) => val);
    throw new ValueIsNotObservableError(reducedValue);
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

/**
 * Initializing observable properties before construction is complete can cause problems if they access an uninitialized field,
 * so we store the initializers on the instance and run them after construction.
 **/
function getOrAddObservablePropertyFactories(instance: any) {
    return getOrAdd<Record<PropertyKey, () => ObservableValue<any>>>(instance, ObservablePropertyFactories, () => ({}));
}

/** Same as getOrAddObservablePropertyInitializers, but for old experimental decorators, which only have access to the prototype. */
function getOrAddLegacyObservablePropertyFactories(prototype: any) {
    return getOrAdd<Record<string | symbol, (instance: any) => ObservableValue<any>>>(prototype, LegacyObservablePropertyFactories,
        base => base ? Object.create(base) : {}); // Because we're dealing with prototypes, we need to inherit from base class' factories
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
                (this as any)[EventsClassBrand] = true;
            }
        }
    }[className];
}

export function isEventsClass(value: unknown): value is Object {
    return value instanceof Object
        && EventsClassBrand in value;
}

export class MissingModelDecoratorError extends Error {
    constructor(
        public model: object,
        public property: string | symbol
    ) {
        super(`${nameOfFunction(model.constructor)} class must be marked as a @model to use @reduced, @derived, or @state properties.`);
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