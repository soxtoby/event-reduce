import { getObservableProperties } from "./decorators";
import { Reduction } from "./reduction";
import { StringKey } from "./types";
import { getOrAdd, isModel, isObject, isPlainObject, jsonPath } from "./utils";

export type State<T> =
    T extends Function ? never
    : T extends Array<infer U> ? StateArray<U>
    : T extends object ? StateObject<T>
    : T;

export interface StateArray<T> extends Array<State<T>> { }
export type StateObject<T> = { [P in keyof T]: State<T[P]> };

const statePropsKey = Symbol('stateProps');

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
    getOrAdd(prototype, statePropsKey, () => [] as string[])
        .push(key);
}

export interface IStateOptions {
    /** 
     * Name of root model, used for errors 
     * @default $
     **/
    name?: string;
    /** @default false */
    includeDerivedProperties?: boolean;
    /** @default 'expect' in production, otherwise 'error' */
    circularReferences?: CircularReferenceHandling;
}

export type CircularReferenceHandling = 'error' | 'warn' | 'expect';

export function getState<T>(model: T, options: IStateOptions = {}): State<T> {
    let { circularReferences, name = '$', ...otherOptions } = options;
    try {
        return getStateRecursive(circularReferences == 'expect' ? options : otherOptions, new Map(), name, model);
    } catch {
        circularReferences ??= (process.env.NODE_ENV === 'production' ? 'expect' : 'error'); // Silently handle circular references in production
        return getStateRecursive({ circularReferences, ...otherOptions }, new Map(), name, model);
    }
}
function getStateRecursive<T>(options: IStateOptions, parentPath: Map<unknown, PropertyKey>, key: PropertyKey, model: T): State<T> {
    if (!isObject(model))
        return model as State<T>;

    if (options.circularReferences && parentPath.has(model))
        return getCircularReference(options.circularReferences, parentPath, key, model);

    parentPath.set(model, key);
    let state = Array.isArray(model)
        ? getArrayState(options, parentPath, model)
        : getObjectState(options, parentPath, model);
    parentPath.delete(model);
    return state;
}

function getArrayState<T>(options: IStateOptions, parentPath: Map<unknown, PropertyKey>, model: T & any[]) {
    return model.map((value, key) => getStateRecursive(options, parentPath, key, value)) as State<T>;
}

function getObjectState<T>(options: IStateOptions, parentPath: Map<unknown, PropertyKey>, model: T) {
    let state = {} as StateObject<T>;
    for (let key of getAllStatefulProperties(model, options.includeDerivedProperties)) {
        let value = model[key as keyof T];
        if (typeof value != 'function')
            state[key as keyof T] = getStateRecursive(options, parentPath, key, value);
    }
    return state as State<T>;
}

function getCircularReference<T>(handling: CircularReferenceHandling, parentPath: Map<unknown, PropertyKey>, key: PropertyKey, model: T) {
    let circularPath = Array.from(parentPath)
        .map(([value, key]) => [key, value] as [PropertyKey, unknown])
        .concat([[key, model]]);

    let circularPathKeys = circularPath.map(([key]) => key);
    let referencedPathKeys = circularPathKeys.slice(0, circularPath.findIndex(([, v]) => v == model) + 1);

    if (handling == 'expect')
        return `<ref: ${jsonPath(referencedPathKeys)}>` as any;

    let error = new CircularReferenceInStateError(circularPath, circularPathKeys, referencedPathKeys);

    if (handling == 'warn') {
        console.warn(error.message, new Details(circularPath));
        return;
    }

    throw error;
}

// Just for naming in the console
class Details { constructor(public circularPath: (readonly [PropertyKey, unknown])[]) { } }

export function setState<T>(model: T, state: StateObject<T>) {
    let observableProps = getReducedProperties(model);
    let stateProps = getAllStatefulProperties(model)
        .filter(key => key in state);

    stateProps.forEach(key => {
        if (key in observableProps)
            observableProps[key].restore(state[key]);
        else if (isObject(model[key]))
            setState(model[key], state[key] as StateObject<T[StringKey<T>]>);
        else
            model[key] = state[key] as T[StringKey<T>];
    });

    return model;
}

function getAllStatefulProperties<T>(model: T, includeDerived = false) {
    if (!isModel(model))
        return Object.keys(model as object) as StringKey<T>[];
    let observableProps = includeDerived
        ? Object.keys(getObservableProperties(model) || {})
        : Object.keys(getReducedProperties(model));
    let explicitProps = getStateProperties(model);
    return observableProps.concat(explicitProps) as StringKey<T>[];
}

export function getStateProperties<T>(model: T): string[] {
    if (isPlainObject(model))
        return [];

    let prototype = Object.getPrototypeOf(model);
    return getStateProperties(prototype)
        .concat(prototype[statePropsKey] as StringKey<T>[] | undefined || []);
}

function getReducedProperties<T>(model: T) {
    let reducedProps = {} as Record<string, Reduction<any>>;
    let observableProps = getObservableProperties(Object.getPrototypeOf(model)) || {};
    for (let key in observableProps) {
        let observableValue = observableProps[key](model);
        if (observableValue instanceof Reduction)
            reducedProps[key] = observableValue;
    }
    return reducedProps;
}

export class CircularReferenceInStateError extends Error {
    constructor(
        public circularPath: ([PropertyKey, unknown])[],
        public circularPathKeys: PropertyKey[],
        public referencedPathKeys: PropertyKey[]
    ) {
        super(`Detected circular reference in model: ${jsonPath(circularPathKeys)} -> ${jsonPath(referencedPathKeys)}`);
    }
}