import { Derivation } from "event-reduce/lib/derivation";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { reactionQueue } from "event-reduce/lib/reactions";
import { ForwardRefExoticComponent, ForwardRefRenderFunction, Fragment, FunctionComponent, MemoExoticComponent, PropsWithChildren, PropsWithoutRef, ReactElement, ReactNode, RefAttributes, ValidationMap, WeakValidationMap, createElement, forwardRef, memo, useCallback, useEffect, useRef } from "react";
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

interface ITrackedComponentProps<Props> {
    props: ITrackedProps<Props>;
    otherArgs: [any];
}

export function reactive<Component extends (ContextlessFunctionComponent<any> | ForwardRefRenderFunction<any, any>)>(component: Component): ReactiveComponent<Component> {
    let componentName = component.displayName || component.name || 'ReactiveComponent';

    let innerComponent = memo(({ props, otherArgs }: ITrackedComponentProps<any>) => {
        useEffect(props.commitProps);
        return useReactive(componentName, () => component(props.tracked, ...otherArgs));
    }, (prev, next) => Array.from(prev.props.accessed).every(key => Object.is(prev.props.untracked[key], next.props.untracked[key])));
    innerComponent.displayName = componentName;

    let outerComponent = ((...args: Parameters<Component>) => { // Important to use rest operator here so react ignores function arity
        let [currentProps, ...otherArgs] = args;
        let props = useLatestProps(currentProps);
        return createElement(innerComponent as FunctionComponent<any>, { props, otherArgs });
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

interface ITrackedProps<T> {
    accessed: Set<keyof T>;
    untracked: T;
    tracked: T;
    commitProps(): void;
}

function useLatestProps<T extends object>(props: T): ITrackedProps<T> {
    let latestProps = useOnce(() => ({} as T));
    let rendered = false;
    let accessed = new Set<keyof T>();

    return {
        accessed,
        untracked: props,
        tracked: new Proxy({ ...props } as any, {
            get(currentProps, key) {
                if (rendered) {
                    return latestProps[key as keyof T];
                } else {
                    accessed.add(key as keyof T);
                    return currentProps[key as keyof T];
                }
            },
            set() { return true; }
        }),
        commitProps() {
            rendered = true;
            Object.assign(latestProps, props);
        }
    }
}