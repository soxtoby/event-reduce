import { getObservableProperties } from "./decorators";
import { Reduction } from "./reduction";
import { StringKey } from "./types";
import { isModel, isObject } from "./utils";

export type State<T> =
    T extends Function ? never
    : T extends Array<infer U> ? StateArray<U>
    : T extends object ? StateObject<T>
    : T;

export interface StateArray<T> extends Array<State<T>> { }
export type StateObject<T> = { [P in keyof T]: State<T[P]> };

const statePropsKey = Symbol('stateProps');

export function state(target: any, key: string) {
    let stateProps = (target[statePropsKey] || (target[statePropsKey] = [])) as string[];
    stateProps.push(key);
}

export function getState<T>(model: T): State<T> {
    if (!isObject(model))
        return model as State<T>;

    if (Array.isArray(model))
        return model.map(getState) as State<T>;

    let stateProps = getAllStatefulProperties(model);

    let state = {} as StateObject<T>;
    stateProps.forEach(key => {
        let value = model[key as keyof T];
        if (typeof value != 'function')
            state[key as keyof T] = getState(value);
    });
    return state as State<T>;
}

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

function getAllStatefulProperties<T>(model: T) {
    if (!isModel(model))
        return Object.keys(model) as StringKey<T>[];
    let observableProps = getReducedProperties(model);
    let explicitProps = getStateProperties(model);
    return Object.keys(observableProps).concat(explicitProps || []) as StringKey<T>[];
}

export function getStateProperties<T>(model: T) {
    return (model as any)[statePropsKey] as StringKey<T>[] | undefined;
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