import { nameOfFunction } from "event-reduce";
import { Derivation } from "event-reduce/lib/derivation";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { reactionQueue } from "event-reduce/lib/reactions";
import { Fragment, ReactElement, ReactNode, createElement, useCallback, useEffect } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import { useDerived } from "./hooks";
import { useOnce } from "./utils";

export function Reactive(props: { name?: string; children: () => ReactNode; }): ReactElement {
    return useReactive(props.name || 'Derived', () => createElement(Fragment, { children: props.children() }));
}

export function reactive<Args extends any[]>(component: (...args: Args) => ReactElement | null) {
    let componentName = nameOfFunction(component) || 'ReactiveComponent';

    const reactiveComponentName = `reactive(${componentName})`;
    return {
        [reactiveComponentName]: (...args: Args) => useReactive(componentName, () => component(...args))
    }[reactiveComponentName];
}

export function useReactive<T>(deriveValue: () => T): T;
export function useReactive<T>(name: string, deriveValue: () => T): T;
export function useReactive<T>(nameOrDeriveValue: string | (() => T), maybeDeriveValue?: () => T): T {
    let [name, deriveValue] = typeof nameOrDeriveValue == 'string'
        ? [nameOrDeriveValue, maybeDeriveValue!]
        : ['ReactiveValue', nameOrDeriveValue];

    let derivation = useSyncDerivation<T>(name);
    return useRenderValue<T>(derivation, deriveValue);
}

function useSyncDerivation<T>(name: string) {
    let derivedValue = useDerived(() => undefined as T, [], name) as Derivation<T>; // Bogus derive function because we'll provide a new one every render

    let render = useOnce(() => new ObservableValue(() => `${name}.render`, 0));

    useEffect(() => derivedValue.subscribe(() => reactionQueue.current.add(() => render.setValue(render.value + 1))), []);

    useSyncExternalStore(useCallback(o => render.subscribe(o), []), () => render.value);

    return derivedValue;
}

function useRenderValue<T>(derivation: Derivation<T>, deriveValue: () => T) {
    useCallback(function update() { derivation.update(deriveValue, 'render'); }, [deriveValue])(); // need to use a hook to be considered a hook in devtools
    return derivation.value;
}