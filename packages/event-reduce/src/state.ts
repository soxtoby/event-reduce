import { getObservableProperties, getStateProperties, isModel } from "./models";
import { Reduction } from "./reduction";
import { OmitValues, StringKey } from "./types";
import { isObject, jsonPath } from "./utils";

export type State<T> =
    T extends Function ? never
    : T extends Array<infer U> ? State<U>[]
    : T extends object ? { [K in StringKey<OmitValues<T, Function>>]: State<T[K]> }
    : T;

export type StateKey<T> = Extract<keyof T, keyof State<T>>;

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
    return getStateRecursive(options, new Map(), options.name ?? '$', model);
}

function getStateRecursive<T>(options: IStateOptions, parentPath: Map<unknown, PropertyKey>, key: PropertyKey, model: T): State<T> {
    if (!isObject(model))
        return model as State<T>;

    if (parentPath.has(model))
        return getCircularReference(options.circularReferences ?? (process.env.NODE_ENV === 'production' ? 'expect' : 'error'), parentPath, key, model);

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
    let state = {} as State<T>;
    for (let key of getAllStatefulProperties(model, options.includeDerivedProperties)) {
        let value = model[key];
        if (typeof value != 'function')
            state[key] = getStateRecursive(options, parentPath, key, value) as State<T>[StateKey<T>];
    }
    return state;
}

function getCircularReference<T>(handling: CircularReferenceHandling, parentPath: Map<unknown, PropertyKey>, key: PropertyKey, model: T) {
    let circularPath = Array.from(parentPath)
        .map(([value, key]) => [key, value] as [PropertyKey, unknown])
        .concat([[key, model]]);

    let circularPathKeys = circularPath.map(([key]) => key);
    let referencedPathKeys = circularPathKeys.slice(0, circularPath.findIndex(([, v]) => v == model) + 1);

    if (handling == 'warn')
        console.warn(CircularReferenceInStateError.message(circularPathKeys, referencedPathKeys), new Details(circularPath));

    if (handling == 'error')
        throw new CircularReferenceInStateError(circularPath, circularPathKeys, referencedPathKeys);

    return `<ref: ${jsonPath(referencedPathKeys)}>` as State<T>;
}

// Just for naming in the console
class Details { constructor(public circularPath: (readonly [PropertyKey, unknown])[]) { } }

export function setState<T>(model: T, state: State<T>) {
    let observableProps = getReducedProperties(model);
    let stateProps = getAllStatefulProperties(model)
        .filter(key => key in (state as object));

    stateProps.forEach(key => {
        if (key in observableProps)
            observableProps[key].restore(state[key]);
        else if (isObject(model[key]))
            setState(model[key], state[key] as State<T[StateKey<T>]>);
        else
            model[key] = state[key] as T[StateKey<T>];
    });

    return model;
}

function getAllStatefulProperties<T>(model: T, includeDerived = false): StateKey<T>[] {
    if (!isModel(model))
        return Object.keys(model as object) as StateKey<T>[];
    let observableProps = includeDerived
        ? Object.keys(getObservableProperties(model) || {})
        : Object.keys(getReducedProperties(model));
    let explicitProps = getStateProperties(model);
    return observableProps.concat(explicitProps) as StateKey<T>[];
}

function getReducedProperties<T>(model: T) {
    let reducedProps = {} as Record<StateKey<T>, Reduction<unknown>>;
    let observableProps = getObservableProperties(Object.getPrototypeOf(model)) || {};
    for (let key in observableProps) {
        let observableValue = observableProps[key](model);
        if (observableValue instanceof Reduction)
            reducedProps[key as StateKey<T>] = observableValue;
    }
    return reducedProps;
}

export class CircularReferenceInStateError extends Error {
    constructor(
        public circularPath: ([PropertyKey, unknown])[],
        public circularPathKeys: PropertyKey[],
        public referencedPathKeys: PropertyKey[]
    ) {
        super(CircularReferenceInStateError.message(circularPathKeys, referencedPathKeys));
    }

    static message(circularPathKeys: PropertyKey[], referencedPathKeys: PropertyKey[]) {
        return `Detected circular reference in model: ${jsonPath(circularPathKeys)} -> ${jsonPath(referencedPathKeys)}`;
    }
}