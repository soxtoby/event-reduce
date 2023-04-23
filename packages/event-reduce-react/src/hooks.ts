import { IObservableValue, IReduction, asyncEvent, derive, event, reduce } from "event-reduce";
import { changeOwnedValue, disposeModel } from "event-reduce/lib/cleanup";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { ValueOf } from "event-reduce/lib/types";
import { useDispose, useOnce } from "./utils";

/** Creates a model that persists across renders of the component and cleans up when the component is unmounted. */
export function useModel<T extends object>(createModel: () => T) {
    let modelOwner = useOnce(() => ({})); // Effectively makes the component the owner of the model for cleanup purposes
    let model = useOnce(() => {
        let model = createModel();
        changeOwnedValue(modelOwner, undefined, model);
        return model;
    });
    useDispose(() => disposeModel(modelOwner));
    return model;
}

export function useEvent<T>(name?: string) {
    return useOnce(() => event<T>(name));
}

export function useAsyncEvent<Result = void, Context = void>(name?: string) {
    return useOnce(() => asyncEvent<Result, Context>(name))
}

export function useDerived<T>(getValue: () => T, name?: string): IObservableValue<T> {
    let derived = useOnce(() => derive(getValue, name));

    useDispose(() => derived.dispose());

    return derived;
}

export function useReduced<T>(initial: T, name?: string): IReduction<T> {
    let reduction = useOnce(() => reduce(initial, name));

    useDispose(() => reduction.dispose());

    return reduction;
}

export function useObservedProps<T extends object>(values: T, name: string = '(anonymous observed values)') {
    let observableValues = useOnce(() => ({} as Record<keyof T, ObservableValue<ValueOf<T>>>));
    let nameBase = (name || '') + '.';

    // Update any values that are already being observed
    for (let [key, observableValue] of Object.entries(observableValues) as [keyof T, ObservableValue<ValueOf<T>>][])
        observableValue.setValue(values[key as keyof T]);

    // Create observable values as properties are accessed
    return new Proxy(Object.isFrozen(values) ? { ...values } : values, {
        get(initialValues, key) {
            return (observableValues[key as keyof T] ??= new ObservableValue(() => nameBase + String(key), initialValues[key as keyof T])).value;
        }
    });
}

export function useObserved<T>(value: T, name: string = '(anonymous observed value)') {
    let observableValue = useOnce(() => new ObservableValue(() => name, value));
    observableValue.setValue(value);
    return observableValue;
}