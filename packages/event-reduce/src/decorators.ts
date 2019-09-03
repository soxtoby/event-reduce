import { Derivation, derive } from "./derivation";
import { IEventBase } from "./events";
import { lastAccessed } from "./observableValue";
import { reduce, Reduction } from "./reduction";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    return {
        set(this: any, value: any) {
            let reduction = lastAccessed.observableValue!;
            if (!reduction || !(reduction instanceof Reduction) || value !== reduction.value)
                throw new Error("@reduced property must be set to the value of a reduction");

            reduction.displayName = String(key);

            if (typeof key == 'string')
                setReducedProperty(this, key, reduction);

            Object.defineProperty(this, key, {
                get: () => reduction.value,
                enumerable: true,
                configurable: true
            });
        }
    };
}

export function extend<T>(reducedValue: T) {
    let source = lastAccessed.observableValue as Reduction<T>;
    if (source && source instanceof Reduction && source.value == reducedValue)
        return reduce(reducedValue)
            .onValueChanged(reducedValue, (_, val) => val);
    throw new Error("Couldn't detect reduced value. Make sure you pass in the value of a reduction directly.");
}

export let derived: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    let property = Object.getOwnPropertyDescriptor(target, key);

    return {
        get() { return getOrSetDerivedProperty(this, key, () => derive(property!.get!.bind(this), String(key))).value; },
        configurable: true
    };
}

let derivedProperties = Symbol('DerivedProperties');

function getOrSetDerivedProperty(target: any, key: string | symbol, createComputedValue: () => Derivation<any>): Derivation<any> {
    let properties = target[derivedProperties] || (target[derivedProperties] = {}) as { [key: string]: Derivation<any> };
    return properties[key] || (properties[key] = createComputedValue());
}

export function getDerivedProperty(target: any, key: string | symbol): Derivation<any> | undefined {
    let properties = target[derivedProperties] || (target[derivedProperties] = {}) as { [key: string]: Derivation<any> };
    return properties[key];
}

let reducedProperties = Symbol('ReducedProperties');

export function getReducedProperty(target: any, key: string): Reduction<any> | undefined {
    return (getReducedProperties(target) || {})[key];
}

export function getReducedProperties(target: any) {
    return target[reducedProperties] as { [key: string]: Reduction<any> };
}

function setReducedProperty(target: any, key: string, reduction: Reduction<any>) {
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
                    if (isObservableEvent(prop))
                        prop.displayName = key;
                });
            }
        }
    }[className];
}

function isObservableEvent(e: any): e is IEventBase {
    return typeof e === 'function'
        && e.displayName;
}