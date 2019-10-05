import { Derivation, derive } from "./derivation";
import { IEventBase } from "./events";
import { lastAccessed, ObservableValue } from "./observableValue";
import { reduce, Reduction } from "./reduction";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    return observableValueProperty(key, Reduction, true, "@reduced property must be set to the value of a reduction");
}

export let derived: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    let property = Object.getOwnPropertyDescriptor(target, key);

    return property!.get ? {
        get() { return getOrSetObservableProperty(this, key as string, () => derive(property!.get!.bind(this), String(key))).value; },
        configurable: true
    } : observableValueProperty(key, Derivation, false, "@derived property must have a getter or be set to the value of a derivation");
}

function observableValueProperty<Type extends ObservableValue<any>>(
    key: string | symbol,
    type: new (...args: any) => Type,
    enumerable: boolean,
    typeError: string
): PropertyDescriptor {
    return {
        set(this: any, value: any) {
            let observableValue = lastAccessed.observableValue!;
            if (!observableValue || !(observableValue instanceof type) || value !== observableValue.value)
                throw new Error(typeError);
            observableValue.displayName = String(key);
            observableValue.container = this;
            if (typeof key == 'string')
                getOrSetObservableProperty(this, key, () => observableValue);
            Object.defineProperty(this, key, {
                get: () => observableValue.value,
                enumerable,
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




let observableProperties = Symbol('ObservableProperties');

function getOrSetObservableProperty(target: any, key: string, createObservableValue: () => ObservableValue<any>) {
    let properties = getOrAddObservableProperties(target);
    if (!properties[key]) {
        properties[key] = createObservableValue();
        properties[key]!.container = target;
    }
    return properties[key]!;
}

export function getObservableProperty(target: any, key: string) {
    return (getObservableProperties(target) || {})[key];
}

function getOrAddObservableProperties(target: any) {
    return getObservableProperties(target) || (target[observableProperties] = {});
}

export function getObservableProperties(target: any) {
    return target[observableProperties] as Record<string, ObservableValue<any> | undefined> | undefined;
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
