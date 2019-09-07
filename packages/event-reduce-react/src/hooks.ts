import { asyncEvent, derive, event, IObservableValue, IReduction } from "event-reduce";
import { useDispose, useOnce } from "./utils";

export function useEvent<T>(name?: string) {
    return useOnce(() => event<T>(name));
}

export function useAsyncEvent<Result = void, Context = void>(name?: string) {
    return useOnce(() => asyncEvent<Result, Context>(name))
}

export function useDerived<T>(getValue: () => T): IObservableValue<T> {
    let derived = useOnce(() => derive(getValue));

    useDispose(() => derived.unsubscribeFromSources());

    return derived;
}

export function useReduced<T>(createReduction: () => IReduction<T>): IObservableValue<T> {
    let reduction = useOnce(createReduction);

    useDispose(() => reduction.unsubscribeFromSources());

    return reduction;
}