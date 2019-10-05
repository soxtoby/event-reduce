import { StringKey } from "./types";
import { getObservableProperties } from "./decorators";
import { Reduction } from "./reduction";

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
    if (!model || typeof model != 'object')
        return model as State<T>;

    if (Array.isArray(model))
        return model.map(getState) as State<T>;

    let stateProps = getStateProperties(model);

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
    let stateProps = getStateProperties(model)
        .filter(key => key in state);

    stateProps.forEach(key => {
        if (key in observableProps)
            observableProps[key].restore(state[key]);
        else if (model[key] && typeof model[key] == 'object')
            setState(model[key], state[key] as StateObject<T[StringKey<T>]>);
        else
            model[key] = state[key] as T[StringKey<T>];
    });

    return model;
}

function getStateProperties<T>(model: T) {
    let observableProps = getReducedProperties(model);
    let explicitProps = (model as any)[statePropsKey] || [] as string[];
    return Object.keys(observableProps || model).concat(explicitProps) as StringKey<T>[];
}

function getReducedProperties<T>(model: T) {
    let reducedProps = {} as Record<string, Reduction<any>>;
    let observableProps = getObservableProperties(model) || {};
    for (let key in observableProps) {
        if (observableProps[key] instanceof Reduction)
            reducedProps[key] = observableProps[key] as Reduction<any>;
    }
    return reducedProps;
}