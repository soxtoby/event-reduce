import { asyncEvent, derive, event, IObservableValue, IReduction, reduce } from "event-reduce";
import { ensureValueOwner } from "event-reduce/lib/cleanup";
import { getObservableValues, getOrSetObservableValue } from "event-reduce/lib/decorators";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { useRef } from "react";
import { useDispose, useOnce } from "./utils";

export function useEvent<T>(name?: string) {
    return useOnce(() => event<T>(name));
}

export function useAsyncEvent<Result = void, Context = void>(name?: string) {
    return useOnce(() => asyncEvent<Result, Context>(name))
}

export function useDerived<T>(getValue: () => T, name?: string): IObservableValue<T> {
    let derived = useOnce(() => derive(getValue, name));

    useDispose(() => derived.unsubscribeFromSources());

    return derived;
}

export function useReduced<T>(initial: T, name?: string): IReduction<T> {
    let reduction = useOnce(() => reduce(initial, name));

    useDispose(() => reduction.unsubscribeFromSources());

    return reduction;
}

export function useAsObservableValues<T extends object>(values: T, name?: string) {
    let valueModel = useRef({} as T);
    let previousObservableValues = getObservableValues(valueModel.current) ?? {};
    valueModel.current = {} as T;

    let nameBase = (name || '') + '.';

    let keys = Array.from(new Set(Object.keys(valueModel.current).concat(Object.keys(values))));

    for (let key of keys) {
        let propValue = values[key as keyof T];
        ensureValueOwner(propValue, undefined); // Prevent prop value from being owned by observable value below to avoid attempting cleanup

        let observableValue = getOrSetObservableValue(valueModel.current, key,
            () => previousObservableValues[key]
                ?? new ObservableValue<any>(() => nameBase + key, propValue));

        observableValue.setValue(propValue);

        Object.defineProperty(valueModel.current, key, {
            get() { return observableValue.value; },
            enumerable: true
        });
    }

    return valueModel.current;
}