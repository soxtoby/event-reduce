import { useOnce, useDispose } from "./utils";
import { asyncEvent, derive, IReduction, event } from "event-reduce";

export function useEvent<T>(name?: string) {
    return useOnce(() => event<T>(name));
}

export function useAsyncEvent<Result = void, Context = void>(name?: string) {
    return useOnce(() => asyncEvent<Result, Context>(name))
}

export function useDerived<T>(getValue: () => T): T {
    let derived = useOnce(() => derive(getValue));

    useDispose(() => derived.unsubscribeFromSources());

    return derived.value;
}

export function useReduced<T>(createReduction: () => IReduction<T>): { readonly value: T } {
    let reduction = useOnce(createReduction);

    useDispose(() => reduction.unsubscribeFromSources());

    return reduction;
}