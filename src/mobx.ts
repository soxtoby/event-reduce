import { action, computed, IComputedValue, observable } from 'mobx';
import { combineEventAndObservable, IObservableEvent } from "./events";
import { createSubscriptionObserver, IObservable, IObserver, ISimpleObservable, ISubscription, Observable } from './observable';
import { accessed, IReduction } from "./reduction";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    return {
        set(this: any, value: any) {
            let reduction = accessed.reductions.pop()!;
            if (typeof key == 'string')
                setReducedProperty(this, key, reduction);
            let box = observable.box(reduction.value, { name: String(key), deep: false });
            reduction.subscribe(value => box.set(value));
            Object.defineProperty(this, key, {
                get: () => {
                    accessed.reductions.push(reduction);
                    return box.get();
                },
                enumerable: true,
                configurable: true
            });
        }
    };
}

export function propertyChanged<T>(getProperty: () => T) {
    accessed.reductions.length = 0;
    accessedDerivedProperties.length = 0;
    getProperty();
    if (accessedDerivedProperties.length == 1)
        return new Observable<T>(o => ({ unsubscribe: accessedDerivedProperties[0].observe(change => o.next(change.newValue)) }));
    if (accessed.reductions.length == 1)
        return (accessed.reductions[0] as ISimpleObservable<T>).asObservable();
    throw new Error("'getProperty' must access a single derived or reduced property");
}

export function extend(getReducedProperty: () => any) {
    accessed.reductions.length = 0;
    getReducedProperty();
    if (accessed.reductions.length == 1)
        return accessed.reductions[0].clone();
    throw new Error("'getReducedProperty' must access a single reduced property");
}

let accessedDerivedProperties = [] as IComputedValue<any>[];
let resetAccessedDerivedProperties: number | undefined;

export let derived: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    let property = Object.getOwnPropertyDescriptor(target, key);

    return {
        get() {
            let computedProperty = getOrSetComputedProperty(this, key, () => computed(property!.get!.bind(this), { name: String(key) }));
            accessedDerivedProperties.push(computedProperty);
            if (!resetAccessedDerivedProperties) {
                resetAccessedDerivedProperties = setTimeout(() => {
                    resetAccessedDerivedProperties = undefined;
                    accessedDerivedProperties.length = 0;
                });
            }
            return computedProperty.get();
        },
        configurable: true
    };
}

let derivedProperties = Symbol('DerivedProperties');

function getOrSetComputedProperty(target: any, key: string | symbol, createComputedValue: () => IComputedValue<any>): IComputedValue<any> {
    let properties = target[derivedProperties] || (target[derivedProperties] = {}) as { [key: string]: IComputedValue<any> };
    return properties[key] || (properties[key] = createComputedValue());
}

let reducedProperties = Symbol('ReducedProperties');

export function getReducedProperties(target: any) {
    return target[reducedProperties] as { [key: string]: IReduction<any> };
}

export function setReducedProperty(target: any, key: string, reduction: IReduction<any>) {
    (target[reducedProperties] || (target[reducedProperties] = {}))[key] = reduction;
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
                        let wrappedEvent = action(key, (item: any) => prop(wrapAsync(key, item)));
                        this[key] = combineEventAndObservable(wrappedEvent, prop.asObservable());
                    }
                });
            }
        }
    }[className];
}

function wrapAsync(name: string, async: any): any {
    if (isObservable(async)) {
        return Object.assign(Object.create(async), {
            subscribe(nextOrObserver: IObserver<any> | ((value: any) => void), error?: (error: any) => void, complete?: () => void): ISubscription {
                let observer = createSubscriptionObserver(nextOrObserver, error, complete);
                return async.subscribe(
                    value => isObservable(value)
                        ? wrapAsync(name, value)
                        : action(name + '.merge', observer.next)(value)
                    ,
                    action(name + '.errored', observer.error),
                    action(name + '.completed', observer.complete)
                );
            }
        });
    }

    if (isPromise(async))
        return Object.assign(Object.create(async), {
            then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
                return wrapAsync(name, async.then(
                    onfulfilled && action(name + '.resolved', onfulfilled),
                    onrejected && action(name + '.rejected', onrejected)));
            },

            catch(onrejected?: (reason: any) => any): Promise<any> {
                return this.then(undefined, onrejected);
            }
        });

    return async;
}

function isObservableEvent(e: any): e is IObservableEvent<any, any> {
    return typeof e === 'function' && !!e.subscribe;
}

function isObservable(o: any): o is IObservable<any> {
    return typeof o === 'object' && typeof o.subscribe === 'function';
}

function isPromise(p: any): p is Promise<any> {
    return typeof p === 'object' && typeof p.then === 'function'
}