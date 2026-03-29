import { Derivation, derive, IDerivation } from "./derivation"
import { isEvent } from "./events"
import { IReduction, Reduction } from "./reduction"
import { ISource, isSource } from "./sources"
import { getState } from "./state"
import { collectAccessedSources, getChildNodes, getUnderlyingSource, trackManagedSourceCreation, updateChildren } from "./tracking"
import { SourceValue } from "./types"
import { argsAre, constant, dispose, getAllPropertyDescriptors, getOrAddWeakEntry, getPrototypeChain, isDisposable, isFunction, isObject, isString, isUndefined, nameOfFunction } from "./utils"

const modelBrand = Symbol('model class')
const modelProperties = Symbol('model properties')

export interface Model extends Disposable {
    [modelProperties]: Record<PropertyKey, ModelProperty>
}

export type ModelProperty = ISource<any> | StateProperty

export function isModel(value: unknown): value is Model {
    return isObject(value)
        && modelProperties in value
}

/** instance -> key -> factory */
let instancePropertyFactories = new WeakMap<object, Record<PropertyKey, () => ModelProperty>>()
/** prototype -> key -> factory */
let prototypePropertyFactories = new WeakMap<object, Record<PropertyKey, (instance: any) => ModelProperty>>()
/** 
 * instance -> getter -> property source
 * Required for getters to cache their source without being overridden in sub-classes
*/
let getterCache = new WeakMap<object, Map<Function, ISource<any>>>()


/** Creates a loose model object. Not required if your model is already decorated with \@{@link model}. */
export function createModel<T extends object>(create: () => T): T & Model {
    let sourceCreation = trackManagedSourceCreation()
    let accesses = collectAccessedSources(null) // Don't want anything accessed during construction to become a source for whatever is creating this
    try {
        let instance = create()
        if (isModel(instance))
            return instance
        let model = Object.create(instance, {
            [modelProperties]: {
                value: Object.fromEntries(
                    getChildNodes(instance)
                        .entries()
                        .flatMap(([node, path]) => isSource(node) ? [[path, node]] : []))
            },
            [dispose]: {
                value() {
                    Object.values(this[modelProperties])
                        .filter(isDisposable)
                        .forEach(p => p[dispose]())
                    if (isDisposable(instance))
                        instance[dispose]()
                }
            }
        })
        updateChildren(model, null, instance)
        sourceCreation.verifySourceManagement()
        return model
    } finally {
        accesses[dispose]()
        sourceCreation[dispose]()
    }
}

export function disposeModel(model: object) {
    if (isModel(model))
        model[dispose]()
}

/** 
 * Marks a class as a model.
 * Initializes \@{@link reduced} and \@{@link derived} properties.
 * Observable values accessed during construction will not be tracked.
 * The model instance will take ownership of all observable and state properties.
 **/
export function model<Class extends new (...args: any[]) => any>(target: Class): Class {
    const className = nameOfFunction(target)
    let thisCtor: new (...args: any[]) => any
    return thisCtor = {
        [className]: class extends target {
            static [modelBrand] = true
            constructor(...args: any[]) {
                let sourceCreation = trackManagedSourceCreation()
                let accesses = collectAccessedSources(null) // Don't want anything accessed during construction to become a source for whatever is creating this
                try {
                    super(...args)

                    let model = this as any as Model

                    let properties = {} as Record<PropertyKey, ModelProperty>

                    let prototypeFactories = getPrototypePropertyFactories(target.prototype)
                    for (let key of Object.keys(prototypeFactories))
                        properties[key] = initializeModelProperty(model, key, prototypeFactories[key])

                    let instanceFactories = getInstancePropertyFactories(model)
                    for (let [key, factory] of Object.entries(instanceFactories))
                        properties[key] = initializeModelProperty(model, key, factory)

                    updateChildren(model, null, properties) // Sets up children with correct paths
                    sourceCreation.verifySourceManagement()

                    // Layer this class' properties onto the super class' properties
                    model[modelProperties] = Object.assign(
                        Object.create(model[modelProperties] ?? {}),
                        properties)

                    instancePropertyFactories.delete(model) // No longer needed, and avoids sub-models re-initializing properties

                    // Outer-most constructor setup
                    let outerMostModelCtor = getPrototypeChain(new.target).find(ctor => modelBrand in ctor)
                    if (outerMostModelCtor == thisCtor) {
                        getterCache.delete(model) // Only needed during construction

                        let json = derive(() => {
                            let obj = {} as Record<PropertyKey, ModelProperty>
                            for (let key in model[modelProperties])
                                obj[key] = model[modelProperties][key]
                            return obj
                        }, `toJSON(${className})`)

                        Object.assign(this, {
                            toJSON() { return super.toJSON?.() ?? json.value },
                            [dispose]() {
                                // Make sure to cover all the properties in the prototype chain
                                for (let layer of getPrototypeChain(model[modelProperties]))
                                    for (let property of Object.values(layer))
                                        updateChildren(model, property, null)
                                json[dispose]()
                                super[dispose]?.()
                            }
                        })
                    }
                } finally {
                    accesses[dispose]()
                    sourceCreation[dispose]()
                }
            }
        }
    }[className]
}

function initializeModelProperty<P extends ModelProperty>(instance: Model, key: PropertyKey, factory: (instance: any) => P) {
    let property = factory(instance)
    if (isSource(property)) { // No need to do this for state properties
        Object.defineProperty(instance, key, {
            // Bind directly to the property for cleaner call stack
            get: Object.getOwnPropertyDescriptor(Object.getPrototypeOf(property), 'value')!.get!.bind(property),
            enumerable: true,
            configurable: true
        })
    } else if (process.env.NODE_ENV !== 'production'
        && (isEvent(property.value) || isEventsClass(property.value))
    ) {
        throw new EventsMarkedAsStateError(instance, key)
    }
    return property
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
        let [target, context] = args

        return {
            init(this: Target, initial: Value) {
                let reduction = getUnderlyingReduction(this, context.name, () => initial)
                getModelGetterCache(this).set(target.get, reduction)
                getInstancePropertyFactories(this)[context.name] = constant(reduction)
                return initial
            },
            get(this: Target) { return (getModelGetterCache(this).get(target.get) as Reduction<Value, any>)!.value },
        }
    } else if (argsAre(args, isFunction, isDecoratorContext)) {
        // Getter property decorator
        let [getter, context] = args
        return cachedGetter(getter, context, instance => getUnderlyingReduction(instance, context.name, getter))

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

        if (reduction.displayName == Reduction.defaultName)
            reduction.displayName = String(key)

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
            return cachedGetter(getter, context, instance => derive(getter.bind(instance), valuesEqual ?? Object.is, String(context.name)))
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

function cachedGetter<Source extends IDerivation<any> | IReduction<any, any>>(
    getter: () => SourceValue<Source>,
    context: ClassGetterDecoratorContext<Model, SourceValue<Source>>,
    createSource: (instance: Model) => Source
) {
    context.addInitializer(function (this: Model) {
        getInstancePropertyFactories(this)[context.name] = cachedSource.bind(this)
    })

    return cachedGetter

    /** Ensures source is only created once during model construction. */
    function cachedGetter(this: Model) {
        return cachedSource.call(this).value
    }

    function cachedSource(this: Model) {
        let cache = getModelGetterCache(this)
        let source = cache.get(getter) as Source
        if (!source)
            cache.set(getter, source = createSource(this))
        return source
    }
}

function sourceSetter(key: PropertyKey, sourceType: { new(...args: any[]): ISource<any>; defaultName: string; }, errorFactory: () => Error): PropertyDescriptor {
    return { set }

    function set(this: object, value: unknown) {
        let source = getUnderlyingSource(value)
        if (!(source instanceof sourceType))
            throw errorFactory()

        if (source.displayName == sourceType.defaultName)
            source.setDisplayName(String(key))

        Object.defineProperty(this, key, {
            get: () => { throw new MissingModelDecoratorError(model, key) },
            set,
            enumerable: true,
            configurable: true
        })
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
        let [prototype, key] = args
        getPrototypePropertyFactories(prototype)[key] = instance => new StateProperty(instance, key)
    } else if (argsAre(args, isUndefined, isClassFieldDecoratorContext)) {
        // Field decorator
        let [_, context] = args
        context.addInitializer(function (this: Model) {
            getInstancePropertyFactories(this)[context.name] = constant(new StateProperty(this, context.name))
        })
    } else if (argsAre(args, isClassAccessorDecoratorTarget, isClassAccessorDecoratorContext)) {
        // Auto-accessor property decorator
        let [_, context] = args
        context.addInitializer(function (this: Model) {
            getInstancePropertyFactories(this)[context.name] = constant(new StateProperty(this, context.name))
        })
    } else {
        // Class decorator, or legacy constructor parameter decorator
        return function decorate(ctor: new (...ctorArgs: any[]) => any) {
            for (let key of args)
                getPrototypePropertyFactories(ctor.prototype)[key] = instance => new StateProperty(instance, key)
        }
    }
}

export class StateProperty implements Disposable {
    constructor(
        private _instance: any,
        public readonly key: PropertyKey
    ) {
        updateChildren(_instance, null, this.value)
    }

    toJSON() { return getState(this.value) }

    get value() { return this._instance[this.key] }

    [dispose]() { updateChildren(this._instance, this.value, null) }
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
                        value.setDisplayName(key)
                        updateChildren(this as any as EventsClass, null, value, `.${key}`)
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

const eventsBrand = Symbol('events class')

export interface EventsClass {
    [eventsBrand]: true
}

export function isEventsClass(value: unknown): value is EventsClass {
    return value instanceof Object
        && eventsBrand in value
}

export function getModelProperties(model: Model): Record<PropertyKey, ModelProperty> {
    return model[modelProperties]
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
function getInstancePropertyFactories(instance: object): Record<PropertyKey, () => ModelProperty> {
    return getOrAddWeakEntry(instancePropertyFactories, instance, () => ({}))
}

/** For class decorators and legacy decorators that don't have access to the instance. */
function getPrototypePropertyFactories(prototype: object): Record<PropertyKey, (instance: any) => ModelProperty> {
    return getOrAddWeakEntry(prototypePropertyFactories, prototype, () => ({}))
}

/** For caching getters during model construction, so accessing them doesn't create extra sources. */
function getModelGetterCache(instance: object): Map<Function, ModelProperty> {
    return getOrAddWeakEntry(getterCache, instance, () => new Map())
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
        public property: PropertyKey
    ) {
        super(`@derived property ${String(property)} must have a getter or be set to the value of a derivation.`)
    }
}

export class EventsMarkedAsStateError extends Error {
    constructor(
        public model: object,
        public property: PropertyKey
    ) {
        super(`Model property ${String(property)} returns an event or events class, and cannot be marked as @state.`)
    }
}