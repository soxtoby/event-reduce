import { IObservableValue, IReduction, asyncEvent, derive, event, reduce } from "event-reduce";
import { changeOwnedValue } from "event-reduce/lib/cleanup";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { ValueOf } from "event-reduce/lib/types";
import { emptyArray } from "event-reduce/lib/utils";
import { DependencyList, useMemo, useRef } from "react";
import { useOnce } from "./utils";

/**
 * Creates a model that persists across renders of the component.
 * @param unobservableDependencies - A list of dependencies that are not observable. The model will be re-created when any of these change.
*/
export function useModel<T extends object>(createModel: () => T, unobservableDependencies?: DependencyList) {
    let modelOwner = useOnce(() => ({})); // Effectively makes the component the owner of the model for cleanup purposes
    return useMemo(() => {
        let model = createModel();
        changeOwnedValue(modelOwner, undefined, model);
        return model;
    }, unobservableDependencies ?? emptyArray);
}

export function useEvent<T>(name?: string) {
    return useOnce(() => event<T>(name));
}

export function useAsyncEvent<Result = void, Context = void>(name?: string) {
    return useOnce(() => asyncEvent<Result, Context>(name))
}

/**
 * Creates a derived value that persists across renders of the component.
 * @param unobservableDependencies - A list of dependencies that are not observable. The derived value will be updated when any of these change.
 * If not specified, the derived value will be updated every render, but will still only *trigger* a re-render inside a reactive component if the derived value changes.
 */
export function useDerived<T>(getValue: () => T, name?: string): IObservableValue<T>;
export function useDerived<T>(getValue: () => T, unobservableDependencies?: DependencyList, name?: string): IObservableValue<T>;
export function useDerived<T>(getValue: () => T, nameOrUnobservableDependencies?: string | DependencyList, name?: string): IObservableValue<T> {
    let unobservableDependencies: DependencyList | undefined;
    [name, unobservableDependencies] = typeof nameOrUnobservableDependencies === 'string'
        ? [nameOrUnobservableDependencies, undefined]
        : [name, nameOrUnobservableDependencies];

    let derived = useOnce(() => derive(getValue, name));

    useMemo(() => derived.update(getValue, 'render'), unobservableDependencies);

    return derived;
}

export function useReduced<T>(initial: T, name?: string): IReduction<T> {
    return useOnce(() => reduce(initial, name));
}

export function useObservedProps<T extends object>(values: T, name: string = '(anonymous observed values)') {
    let observableValues = useModel(() => ({} as Record<keyof T, ObservableValue<ValueOf<T>>>));
    let nameBase = (name || '') + '.';

    // Update any values that are already being observed
    for (let [key, observableValue] of Object.entries(observableValues) as [keyof T, ObservableValue<ValueOf<T>>][])
        observableValue.setValue(values[key as keyof T]);

    let latestValues = useRef(values);
    latestValues.current = values;

    // Create observable values as properties are accessed
    return new Proxy({} as T, {
        get(_, key) {
            return (observableValues[key as keyof T]
                ??= new ObservableValue(
                    () => nameBase + String(key),
                    (latestValues.current)[key as keyof T]))
                .value;
        }
    });
}

export function useObserved<T>(value: T, name: string = '(anonymous observed value)') {
    let observableValue = useModel(() => new ObservableValue(() => name, value));
    observableValue.setValue(value);
    return observableValue;
}