import { Derivation, derive, IDerivation } from "./derivation"
import { isEvent } from "./events"
import { getChildNodes, trackManagedSourceCreation, updateChildren } from "./ownership"
import { IReduction, Reduction } from "./reduction"
import { ISource, isSource, Source } from "./sources"
import { getState } from "./state"
import { collectAccessedSources, getUnderlyingSource } from "./tracking"
import { SourceValue } from "./types"
import { argsAre, constant, dispose, emptyArray, getAllPropertyDescriptors, getOrAddWeakEntry, getPrototypeChain, isDisposable, isFunction, isObject, isString, isUndefined, nameOfFunction } from "./utils"

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

/** instance -> key -> provider */
let instancePropertyProviders = new WeakMap<object, Record<PropertyKey, () => ModelProperty>>()
/** prototype -> key -> provider */
let prototypePropertyProviders = new WeakMap<object, Record<PropertyKey, (instance: any) => ModelProperty>>()
/** 
 * instance -> getter -> property source
 * Required for getters to cache their source without being overridden in sub-classes
*/
let getterCache = new WeakMap<object, Map<Function, ISource<any>>>()
let registeredInstanceProperties = new WeakMap<object, ModelProperty[]>()


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
export function model<Class extends new (...args: any[]) => object>(target: Class): Class {
    const className = nameOfFunction(target)
    let thisCtor: Class
    return thisCtor = {
        [className]: class extends target {
            static [modelBrand] = true
            constructor(...args: any[]) {
                // Model decorator is ignored on base classes
                let outerMostModelCtor = getPrototypeChain(new.target).find(ctor => Object.hasOwn(ctor, modelBrand))
                if (thisCtor != outerMostModelCtor) {
                    super(...args)
                    return
                }

                let sourceCreation = trackManagedSourceCreation()
                let accesses = collectAccessedSources(null) // Don't want anything accessed during construction to become a source for whatever is creating this
                let allProperties: readonly ModelProperty[] = emptyArray
                try {
                    super(...args)

                    let model = this as any as Model
                    let properties = model[modelProperties] = {} as Record<PropertyKey, ModelProperty>

                    let instanceProviders = Object.entries(getInstancePropertyProviders(model))
                    for (let [key, getProperty] of instanceProviders)
                        properties[key] = getProperty()

                    let prototypeProviders = getPrototypeChain(target.prototype).flatMap(p => Object.entries(getPrototypePropertyProviders(p)))
                    for (let [key, getProperty] of prototypeProviders)
                        properties[key] ??= getProperty(model) // Instance and sub-class properties take precedence over super-class properties

                    for (let [key, property] of Object.entries(properties)) {
                        if (isSource(property)) {
                            Object.defineProperty(model, key, {
                                // Bind directly to the property for cleaner call stack
                                get: getPrototypeChain(property)
                                    .map(proto => Object.getOwnPropertyDescriptor(proto, 'value'))
                                    .find(value => !!value)!
                                    .get!.bind(property),
                                enumerable: true,
                                configurable: true
                            })
                        }
                    }

                    allProperties = registeredInstanceProperties.get(model) ?? [] // Includes overridden super-class properties
                    if (process.env.NODE_ENV !== 'production' && !allProperties.length)
                        console.warn(`Model ${className} has no @reduced, @derived, or @state properties. You can remove the @model decorator.`)

                    sourceCreation.verifySourceManagement()

                    // These are no longer needed
                    registeredInstanceProperties.delete(model)
                    instancePropertyProviders.delete(model)
                    getterCache.delete(model)

                    if (typeof (model as any).toJSON != 'function')
                        Object.assign(this, { toJSON() { return properties } })

                    Object.assign(this, {
                        [dispose]() {
                            for (let property of allProperties)
                                updateChildren(model, property, null)
                            super[dispose]?.()
                        }
                    })
                } finally {
                    accesses[dispose]()
                    sourceCreation[dispose]()
                }
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
        let [target, context] = args

        return {
            init(this: Target, initial: Value) {
                return cachedGetter(
                    context.name,
                    target.get,
                    factory => addInstancePropertyFactory(this, context.name, factory),
                    instance => getUnderlyingReduction(instance, context.name, () => initial)
                ).call(assertIsModel(this, context.name))
            },
            get(this: Target) { return (getModelGetterCache(this).get(target.get) as Reduction<Value, any>)!.value },
        }
    } else if (argsAre(args, isFunction, isDecoratorContext)) {
        // Getter property decorator
        let [getter, context] = args
        return cachedGetter(
            context.name,
            getter,
            factory => addInstancePropertyFactoryInitializer(context, factory),
            instance => getUnderlyingReduction(instance, context.name, getter))

    } else {
        // Legacy decorator
        let [prototype, key] = args
        let property = Object.getOwnPropertyDescriptor(prototype, key)!

        if (property?.get) {
            let getter = property.get

            return {
                get: cachedGetter(
                    key,
                    getter,
                    factory => addPrototypePropertyFactory(prototype, key, factory),
                    instance => getUnderlyingReduction(assertIsModel(instance, key), key, getter)),
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
            return cachedGetter(
                context.name,
                getter,
                factory => addInstancePropertyFactoryInitializer(context, factory),
                instance => derive(getter.bind(instance), valuesEqual ?? Object.is, String(context.name)))
        } else {
            // Legacy decorator
            let [prototype, key] = args
            let property = Object.getOwnPropertyDescriptor(prototype, key)!

            if (property?.get) {
                let getter = property.get
                return {
                    get: cachedGetter(
                        key,
                        getter,
                        factory => addPrototypePropertyFactory(prototype, key, factory),
                        instance => derive(getter.bind(assertIsModel(instance, key)), valuesEqual ?? Object.is, String(key))),
                    enumerable: true,
                    configurable: true
                }
            } else {
                return sourceSetter(key, Derivation, () => new InvalidDerivedPropertyError(key))
            }
        }
    }
}

function cachedGetter<Source extends IDerivation<any> | IReduction<any, any>>(
    key: PropertyKey,
    getter: () => SourceValue<Source>,
    addPropertyFactory: (cachedSource: (instance: any) => Source) => void,
    createSource: (instance: Model) => Source
) {
    addPropertyFactory(cachedSource)

    /** Ensures source is only created once during model construction. */
    return function cachedGetter(this: Model) {
        return cachedSource(this).value
    }

    function cachedSource(instance: Model) {
        let cache = getModelGetterCache(instance)
        let source = cache.get(getter) as Source
        if (!source)
            cache.set(getter, source = registerModelProperty<Source>(instance, key, createSource))
        return source
    }
}

function addInstancePropertyFactoryInitializer(context: ClassGetterDecoratorContext<Model, any> | ClassAccessorDecoratorContext<Model, any>, cachedSource: (instance: any) => ISource<any>) {
    context.addInitializer(function (this: Model) {
        assertIsModel(this, context.name)
        addInstancePropertyFactory(this, context.name, cachedSource)
    })
}

function addInstancePropertyFactory(instance: Model, key: PropertyKey, cachedSource: (instance: any) => ISource<any>) {
    getInstancePropertyProviders(instance)[key] = cachedSource.bind(null, instance)
}

function addPrototypePropertyFactory(prototype: object, key: PropertyKey, cachedSource: (instance: any) => ISource<any>) {
    getPrototypePropertyProviders(prototype)[key] = cachedSource
}

function sourceSetter(key: PropertyKey, sourceType: { new(...args: any[]): ISource<any>; defaultName: string; }, errorFactory: () => Error): PropertyDescriptor {
    return { set }

    function set(this: object, value: unknown) {
        assertIsModel(this as Model, key)

        let source = getUnderlyingSource(value)
        if (!(source instanceof sourceType))
            throw errorFactory()

        if (source.displayName == sourceType.defaultName)
            source.setDisplayName(String(key))

        registerModelProperty(this as Model, key, () => source)
        getInstancePropertyProviders(this)[key] = constant(source)

        Object.defineProperty(this, key, {
            get: () => (source as Source<any>).value,
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
export function state<Target extends Model, Value>(...args:
    | string[]
    | [undefined, ClassFieldDecoratorContext<Target, Value>]
    | [ClassAccessorDecoratorTarget<Target, Value>, ClassAccessorDecoratorContext<Target, Value>]
    | [string]
    | [object, string]
) {
    if (argsAre(args, isObject, isString)) {
        // Legacy decorator
        let [prototype, key] = args
        getPrototypePropertyProviders(prototype)[key] = instance => registerModelProperty(instance, key, () => new StateProperty(instance, key))
    } else if (argsAre(args, isUndefined, isClassFieldDecoratorContext)) {
        // Field decorator
        let [_, context] = args
        context.addInitializer(function (this: Target) {
            assertIsModel(this, context.name)
            getInstancePropertyProviders(this)[context.name] = () => registerModelProperty(this, context.name, () => new StateProperty(this, context.name))
        })
    } else if (argsAre(args, isClassAccessorDecoratorTarget, isClassAccessorDecoratorContext)) {
        // Auto-accessor property decorator
        let [_, context] = args
        context.addInitializer(function (this: Target) {
            assertIsModel(this, context.name)
            getInstancePropertyProviders(this)[context.name] = () => registerModelProperty(this, context.name, () => new StateProperty(this, context.name))
        })
    } else {
        // Class decorator, or legacy constructor parameter decorator
        return function decorate(ctor: new (...ctorArgs: any[]) => any) {
            for (let key of args)
                getPrototypePropertyProviders(ctor.prototype)[key] = instance => registerModelProperty(instance, key, () => new StateProperty(instance, key))
        }
    }
}

function assertIsModel<Target extends Model>(model: Target, key: PropertyKey) {
    if (process.env.NODE_ENV !== 'production' && !getPrototypeChain(model.constructor).some(p => Object.hasOwn(p, modelBrand)))
        throw new MissingModelDecoratorError(model, key)
    return model
}

function registerModelProperty<Property extends ModelProperty>(model: Model, key: PropertyKey, createProperty: (model: Model) => Property) {
    let property = createProperty(model)
    updateChildren(model, null, property, `.${String(key)}`)
    getOrAddWeakEntry(registeredInstanceProperties, model, () => []).push(property)
    return property
}

export class StateProperty implements Disposable {
    constructor(
        private _instance: any,
        public readonly key: PropertyKey
    ) {
        if (process.env.NODE_ENV !== 'production') {
            if (isEvent(this.value) || isEventsClass(this.value))
                throw new EventsMarkedAsStateError(_instance, this.key)
        }

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
function getInstancePropertyProviders(instance: object): Record<PropertyKey, () => ModelProperty> {
    return getOrAddWeakEntry(instancePropertyProviders, instance, () => ({}))
}

/** For class decorators and legacy decorators that don't have access to the instance. */
function getPrototypePropertyProviders(prototype: object): Record<PropertyKey, (instance: any) => ModelProperty> {
    return getOrAddWeakEntry(prototypePropertyProviders, prototype, () => ({}))
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
