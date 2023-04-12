import { Derivation } from "event-reduce/lib/derivation";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { reactionQueue } from "event-reduce/lib/reactions";
import { ForwardRefExoticComponent, ForwardRefRenderFunction, Fragment, FunctionComponent, MemoExoticComponent, PropsWithChildren, PropsWithoutRef, ReactElement, ReactNode, Ref, RefAttributes, ValidationMap, WeakValidationMap, createElement, forwardRef, memo, useCallback, useEffect } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import { useDerived } from "./hooks";
import { useOnce } from "./utils";

interface ContextlessFunctionComponent<P = {}> {
    (props: PropsWithChildren<P>): ReactElement | null;
    propTypes?: WeakValidationMap<P>;
    contextTypes?: ValidationMap<any>;
    defaultProps?: Partial<P>;
    displayName?: string;
}

export type ReactiveComponent<Component extends ContextlessFunctionComponent<any> | ForwardRefRenderFunction<any, any>> =
    Component extends ContextlessFunctionComponent<any> ? MemoExoticComponent<Component>
    : Component extends ForwardRefRenderFunction<infer Ref, infer Props> ? MemoExoticComponent<ForwardRefExoticComponent<PropsWithoutRef<Props> & RefAttributes<Ref>>>
    : never;

export function Reactive(props: { name?: string; children: () => ReactNode; }): ReactElement {
    return useReactive(props.name || 'Derived', () => createElement(Fragment, { children: props.children() }));
}

export function reactive<Component extends (ContextlessFunctionComponent<any> | ForwardRefRenderFunction<any, any>)>(component: Component): ReactiveComponent<Component> {
    let componentName = component.displayName || component.name || 'ReactiveComponent';

    let innerComponent = memo(forwardRef(({ __propTracking, ...currentProps }: { __propTracking: IPropTracking<any> }, ref: Ref<any>) => {
        let trackedProps = useTrackedProps(__propTracking, currentProps);
        return useReactive(componentName, () => component(trackedProps, ref));
    }), (prev, next) => Array.from(prev.__propTracking.accessed).every(key => Object.is(prev[key as keyof unknown], next[key as keyof unknown])));
    innerComponent.displayName = componentName;

    let outerComponent = ((...args: Parameters<Component>) => { // Important to use rest operator here so react ignores function arity
        let [currentProps, ref] = args;
        return createElement(innerComponent as FunctionComponent<any>, { ...currentProps, ref, __propTracking: usePropTracking() });
    }) as ReactiveComponent<Component>;
    outerComponent.displayName = `reactive(${componentName})`;

    if (component.length == 2)
        outerComponent = forwardRef(outerComponent) as ReactiveComponent<Component>;

    return outerComponent;
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
    let derivedValue = useDerived(() => undefined as T, name) as Derivation<T>; // Bogus derive function because we'll provide a new one every render

    let render = useOnce(() => new ObservableValue(() => `${name}.render`, 0));

    useEffect(() => derivedValue.invalidation.subscribe(() => reactionQueue.current.add(() => render.setValue(render.value + 1))), []);

    useSyncExternalStore(useCallback(o => render.subscribe(o), []), () => render.value);

    return derivedValue;
}

function useRenderValue<T>(derivation: Derivation<T>, deriveValue: () => T) {
    useCallback(function update() { derivation.update(deriveValue, 'render'); }, [deriveValue])(); // need to use a hook to be considered a hook in devtools
    return derivation.value;
}

interface IPropTracking<T> {
    latestProps: T;
    accessed: Set<keyof T>;
    commitProps(props: T): void;
}

function usePropTracking<T extends object>(): IPropTracking<T> {
    let latestProps = useOnce(() => ({} as T));
    let accessed = new Set<keyof T>();

    return {
        latestProps,
        accessed,
        commitProps(props: T) { Object.assign(latestProps, props); }
    };
}

function useTrackedProps<P>(tracking: IPropTracking<P>, currentProps: P): P {
    let rendered = false;
    useEffect(() => {
        rendered = true;
        tracking.commitProps(currentProps);
    });
    return new Proxy({ ...currentProps } as any, {
        get(currentProps, key) {
            if (rendered) {
                return tracking.latestProps[key as keyof P];
            } else {
                tracking.accessed.add(key as keyof P);
                return currentProps[key as keyof P];
            }
        },
        set() { return true; }
    });
}