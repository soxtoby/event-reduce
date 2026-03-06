import { argsAre, constant, dispose, getAllPropertyDescriptors, isFunction, isObject, isString, isUndefined, nameOfFunction } from "../utils"
import { Derivation, derive } from "./derivation"
import { isEvent } from "./events"
import { Reduction } from "./reduction"
import { ISource, isSource } from "./signals"
import { getState } from "./state"
import { getUnderlyingSource, trackAccessedSources, trackManagedSourceCreation, updateOwnedObjects } from "./tracking"

export interface Model extends Disposable {
    [modelProperties]: Record<PropertyKey, ModelProperty>
}

type UninitializedModel = { [modelPropertyFactories]?: Record<PropertyKey, () => ModelProperty> }
type ModelPrototype = { [prototypePropertyFactories]?: Record<PropertyKey, (instance: any) => ModelProperty> }

type ModelProperty = ISource<any> | StateProperty

const modelPropertyFactories = Symbol('model property factories')
const prototypePropertyFactories = Symbol('prototype property factories')
const modelProperties = Symbol('model properties')
const eventsBrand = Symbol('events class')

/** 
 * Marks a class as a model.
 * Initializes \@{@link reduced} and \@{@link derived} properties.
 * Observable values accessed during construction will not be tracked.
 * The model instance will take ownership of all observable and state properties.
 **/
export function model<Class extends new (...args: any[]) => any>(target: Class): Class {
    const className = nameOfFunction(target)
    return {
        [className]: class extends target {
            [modelProperties] = {} as Record<PropertyKey, ModelProperty>
            constructor(...args: any[]) {
                let sourceCreation = trackManagedSourceCreation()
                let accesses = trackAccessedSources(null) // Don't want anything accessed during construction to become a source for whatever is creating this
                try {

                    super(...args)

                    let prototypeFactories = (target.prototype as ModelPrototype)?.[prototypePropertyFactories]
                    if (prototypeFactories)
                        for (let key of Object.keys(prototypeFactories))
                            this[modelProperties][key] = prototypeFactories[key](this)

                    let instanceFactories = (this as UninitializedModel)[modelPropertyFactories]
                    if (instanceFactories)
                        for (let key of Object.keys(instanceFactories))
                            this[modelProperties][key] = instanceFactories[key]()

                    for (let property of Object.values(this[modelProperties]))
                        updateOwnedObjects(this, null, property)

                    sourceCreation.verifySourceManagement()

                    for (let [key, property] of Object.entries(this[modelProperties])) {
                        if (isSource(property)) { // No need to do this for state properties
                            Object.defineProperty(this, key, {
                                // Bind directly to the property for cleaner call stack (NOCOMMIT check this works)
                                get: Object.getOwnPropertyDescriptor(Object.getPrototypeOf(property), 'value')!.get!.bind(property),
                                enumerable: true,
                                configurable: true
                            })
                        } else if (process.env.NODE_ENV !== 'production'
                            && (isEvent(property.value) || isEventsClass(property.value))
                        ) {
                            throw new EventsMarkedAsStateError(this, key)
                        }
                    }
                } finally {
                    accesses[dispose]()
                    sourceCreation[dispose]()
                }
            }

            #json = derive(() => getState(this[modelProperties]), `toJSON(${className})`)

            toJSON() { return super.toJSON?.() ?? this.#json.value }

            [dispose]() {
                Object.values(this[modelProperties])
                    .forEach(p => (p as any as Disposable)[dispose]?.())
                super[dispose]?.()
            }
        }
    }[className]
}

export function reduced<Model, Value>(accessor: ClassAccessorDecoratorTarget<Model, Value>, context: ClassAccessorDecoratorContext<Model, Value>): ClassAccessorDecoratorResult<unknown, Value>
export function reduced<Model, Value>(getter: () => Value, context: ClassGetterDecoratorContext<Model, Value>): void
export function reduced(prototype: object, key: string | symbol): void
export function reduced<Value, Target extends Model>(...args:
    | [ClassAccessorDecoratorTarget<unknown, Value>, ClassAccessorDecoratorContext<Target, Value>]
    | [() => Value, ClassGetterDecoratorContext<Target, Value>]
    | [Object, string | symbol]
) {
    if (argsAre(args, isClassAccessorDecoratorTarget, isClassAccessorDecoratorContext)) {
        // Auto-accessor property decorator
        let [_, context] = args

        return {
            init(this: UninitializedModel, initial: Value) {
                let reduction = getUnderlyingReduction(this, context.name, () => initial)
                getModelPropertyFactories(this)[context.name] = constant(reduction)
                return initial
            },
            get(this: Target) { throw new MissingModelDecoratorError(model, context.name) }
        }
    } else if (argsAre(args, isFunction, isDecoratorContext)) {
        // Getter property decorator
        let [getter, context] = args

        context.addInitializer(function (this: Target) {
            getModelPropertyFactories(this)[context.name] = getUnderlyingReduction.bind(null, this, context.name, getter)
        })

    } else {
        // Legacy decorator
        let [prototype, key] = args
        let property = Object.getOwnPropertyDescriptor(prototype, key)!

        if (property?.get) {
            let getter = property.get

            getPrototypePropertyFactories(prototype)[key] = instance => getUnderlyingReduction(instance, key, getter)

            return {
                get(this: Target) { throw new MissingModelDecoratorError(model, key) },
                enumerable: true,
                configurable: true
            }
        } else {
            return sourceSetter(key, Reduction, () => new InvalidReducedPropertyError(key))
        }
    }

    function getUnderlyingReduction(instance: any, key: PropertyKey, getter: Function) {
        let reduction = getUnderlyingSource(getter.call(instance))
        if (!(reduction instanceof Reduction))
            throw new InvalidReducedPropertyError(key)
        return reduction
    }
}

export function derived<Model, Value>(getter: () => Value, context: ClassGetterDecoratorContext<Model, Value>): void
export function derived<Value>(valuesEqual: (previous: Value, next: Value) => boolean): { <Model>(getter: () => Value, context: ClassGetterDecoratorContext<Model, Value>): void; (prototype: Object, key: string | symbol): void; }
export function derived(prototype: object, key: string | symbol): void
export function derived<Target extends Model, Value>(...args:
    | [(previous: Value, next: Value) => boolean]
    | [() => Value, ClassGetterDecoratorContext<Target, Value>]
    | [object, string | symbol]
) {
    let valuesEqual = undefined as ((previous: any, next: any) => boolean) | undefined

    if (argsAre(args, isFunction)) {
        [valuesEqual] = args
        return decorate
    } else if (argsAre(args, isFunction, isDecoratorContext)) {
        return decorate(...args)
    } else {
        return decorate(...args)
    }

    function decorate<Model, Value>(getter: () => Value, context: ClassGetterDecoratorContext<Model, Value>): void
    function decorate(prototype: object, key: string | symbol): void
    function decorate<Target extends Model, Value>(...args:
        | [() => Value, ClassGetterDecoratorContext<Target, Value>]
        | [object, string | symbol]
    ) {
        if (argsAre(args, isFunction, isDecoratorContext)) {
            // Getter property decorator
            let [getter, context] = args
            context.addInitializer(function (this: Target) {
                let derived = derive(getter.bind(this), valuesEqual ?? Object.is, String(context.name))
                getModelPropertyFactories(this)[context.name] = constant(derived)
            })
        } else {
            // Legacy decorator
            let [prototype, key] = args
            let property = Object.getOwnPropertyDescriptor(prototype, key)!

            if (property?.get) {
                let getter = property.get
                let createDerivation = (instance: any) => derive(getter.bind(instance), valuesEqual ?? Object.is, String(key))
                getPrototypePropertyFactories(prototype)[key] = createDerivation
                return {
                    get(this: Target) { throw new MissingModelDecoratorError(model, key) },
                    enumerable: true,
                    configurable: true
                }
            }

            return sourceSetter(key, Derivation, () => new InvalidDerivedPropertyError(key))
        }
    }
}

/** Mark a property as part of the model's state. */
export function state<Model, Value>(value: undefined, context: ClassFieldDecoratorContext<Model, Value>): void
/** Mark a property as part of the model's state. */
export function state<Model, Value>(accessor: ClassAccessorDecoratorTarget<Model, Value>, context: ClassAccessorDecoratorContext<Model, Value>): void
/** Mark a constructor parameter as a state property by specifying its name. */
export function state<Key extends string>(property: Key): (target: Function, ...rest: any) => void //..rest: any to support both constructor parameters and classes
/** Mark a property as a state property. */
export function state(target: object, key: string): void
export function state<Model extends object, Value>(...args:
    | string[]
    | [undefined, ClassFieldDecoratorContext<Model, Value>]
    | [ClassAccessorDecoratorTarget<Model, Value>, ClassAccessorDecoratorContext<Model, Value>]
    | [string]
    | [object, string]
) {
    if (argsAre(args, isObject, isString)) {
        // Legacy decorator
        let [instance, key] = args
        getModelPropertyFactories(instance)[key] = constant(new StateProperty(instance, key))
    } else if (argsAre(args, isUndefined, isClassFieldDecoratorContext)) {
        // Field decorator
        let [_, context] = args
        context.addInitializer(function (this: Model) {
            getModelPropertyFactories(this)[context.name] = constant(new StateProperty(this, context.name))
        })
    } else if (argsAre(args, isClassAccessorDecoratorTarget, isClassAccessorDecoratorContext)) {
        // Auto-accessor property decorator
        let [_, context] = args
        context.addInitializer(function (this: Model) {
            getModelPropertyFactories(this)[context.name] = constant(new StateProperty(this, context.name))
        })
    } else {
        // Class decorator, or legacy constructor parameter decorator
        return function decorate(ctor: new (...ctorArgs: any[]) => any) {
            for (let key of args)
                getPrototypePropertyFactories(ctor.prototype)[key] = instance => new StateProperty(instance, key)
        }
    }
}

/**
 * Marks a class as an events class.
 * Automatically populates the names of event properties.
 * Events returned from getters will be snapshotted, so the getter function is only called once.
 */
export let events = <T extends { new(...args: any[]): any }>(target: T): T => {
    const className = nameOfFunction(target)
    return {
        [className]: class extends target {
            constructor(...args: any[]) {
                super(...args)
                for (let [key, property] of getAllPropertyDescriptors(this)) {
                    let value = this[key]
                    if (isEvent(value)) {
                        value.displayName = key
                        // value.container = this // NOCOMMIT container
                        if (property.get)
                            Object.defineProperty(this, key, {
                                value,
                                configurable: true,
                                enumerable: true
                            })
                    }
                }
                (this as any)[eventsBrand] = true
            }
        }
    }[className]
}

export function isEventsClass(value: unknown): value is Object {
    return value instanceof Object
        && eventsBrand in value
}

class StateProperty {
    constructor(private _instance: any, private _key: PropertyKey) { }
    toJSON() { return this.value }
    get value() { return this._instance[this._key] }
}

function isClassFieldDecoratorContext(context: ClassFieldDecoratorContext<any, any> | unknown): context is ClassFieldDecoratorContext<any, any> {
    return isDecoratorContext(context) && context.kind == 'field'
}

function isClassAccessorDecoratorTarget(context: ClassAccessorDecoratorTarget<any, any> | unknown): context is ClassAccessorDecoratorTarget<any, any> {
    return isObject(context) && !!(context as ClassAccessorDecoratorTarget<any, any>).get
}

function isClassAccessorDecoratorContext(context: ClassAccessorDecoratorContext<any, any> | unknown): context is ClassAccessorDecoratorContext<any, any> {
    return isDecoratorContext(context) && context.kind == 'accessor'
}

function isDecoratorContext(context: ClassMemberDecoratorContext | unknown): context is DecoratorContext {
    return isObject(context) && !!(context as ClassMemberDecoratorContext).kind
}

/** For new decorators which have access to the instance. */
function getModelPropertyFactories(instance: object) {
    return (instance as UninitializedModel)[modelPropertyFactories] ??= {}
}

/** For class decorators and legacy decorators that don't have access to the instance. */
function getPrototypePropertyFactories(prototype: object) {
    return (prototype as ModelPrototype)[prototypePropertyFactories] ??= {}
}

function sourceSetter(key: PropertyKey, sourceType: { new(...args: any[]): ISource<any> }, errorFactory: () => Error): PropertyDescriptor {
    return { set }

    function set(this: object, value: unknown) {
        let source = getUnderlyingSource(value)
        if (!(source instanceof sourceType))
            throw errorFactory()

        Object.defineProperty(this, key, {
            get: () => { throw new MissingModelDecoratorError(model, key) },
            set,
            enumerable: true,
            configurable: true
        })
    }
}

export function isModel(value: unknown): value is Model {
    return isObject(value)
        && modelProperties in value
}

// NOCOMMIT remove - just for compiling temp tests
export function asModel<T extends object>(value: T): T & Model {
    return Object.assign(value, { [modelProperties]: {} }) as T & Model
}

export class MissingModelDecoratorError extends Error {
    constructor(
        public model: object,
        public property: PropertyKey
    ) {
        super(`${nameOfFunction(model.constructor)} class must be marked as a @model to use @reduced, @derived, or @state properties.`)
    }
}

export class InvalidReducedPropertyError extends Error {
    constructor(
        public property: PropertyKey
    ) {
        super(`@reduced property '${String(property)}' must return, or be set to, the value of a reduction.`)
    }
}

export class InvalidDerivedPropertyError extends Error {
    constructor(
        public property: string | symbol
    ) {
        super(`@derived property ${String(property)} must have a getter or be set to the value of a derivation.`)
    }
}

export class EventsMarkedAsStateError extends Error {
    constructor(
        public model: object,
        public property: string | symbol
    ) {
        super(`Model property ${String(property)} returns an event or events class, and cannot be marked as @state.`)
    }
}