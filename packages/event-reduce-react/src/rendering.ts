import { watch } from "event-reduce";
import { log, sourceTree } from "event-reduce/lib/logging";
import { collectAccessedValues, ObservableValue } from "event-reduce/lib/observableValue";
import { addReaction } from "event-reduce/lib/reactions";
import { createElement, forwardRef, ForwardRefExoticComponent, Fragment, FunctionComponent, memo, MemoExoticComponent, PropsWithChildren, PropsWithoutRef, ReactElement, ReactNode, RefAttributes, RefForwardingComponent, useEffect, useState, ValidationMap, WeakValidationMap } from "react";
import { useAsObservableValues } from "./hooks";

interface ContextlessFunctionComponent<P = {}> {
    (props: PropsWithChildren<P>): ReactElement | null;
    propTypes?: WeakValidationMap<P>;
    contextTypes?: ValidationMap<any>;
    defaultProps?: Partial<P>;
    displayName?: string;
}

export type ReactiveComponent<Component extends ContextlessFunctionComponent<any> | RefForwardingComponent<any, any>> =
    Component extends ContextlessFunctionComponent<any> ? MemoExoticComponent<Component>
    : Component extends RefForwardingComponent<infer Ref, infer Props> ? MemoExoticComponent<ForwardRefExoticComponent<PropsWithoutRef<Props> & RefAttributes<Ref>>>
    : never;

export function Reactive(props: { name?: string; children: () => ReactNode; }): ReactElement {
    return useReactive(props.name || 'Derived', () => createElement(Fragment, { children: props.children() }));
}

export function reactive<Component extends (ContextlessFunctionComponent<any> | RefForwardingComponent<any, any>)>(component: Component): ReactiveComponent<Component> {
    let componentName = component.displayName || component.name || 'ReactiveComponent';
    let reactiveComponent = ((...args: Parameters<Component>) => { // Important to use rest operator here so react ignores function arity
        let [props, ...otherArgs] = args;
        let observableProps = useAsObservableValues(props, `${componentName}.props`);
        return useReactive(componentName, () => component(observableProps, ...otherArgs as [any]));
    }) as ReactiveComponent<Component>;

    if (component.length == 2)
        reactiveComponent = forwardRef(reactiveComponent) as ReactiveComponent<Component>;
    reactiveComponent = memo<Component>(reactiveComponent as FunctionComponent<any>) as ReactiveComponent<Component>;
    reactiveComponent.displayName = componentName;
    return reactiveComponent;
}

export function useReactive<T>(deriveValue: () => T): T;
export function useReactive<T>(name: string, deriveValue: () => T): T;
export function useReactive<T>(nameOrDeriveValue: string | (() => T), maybeDeriveValue?: () => T): T {
    let [name, deriveValue] = typeof nameOrDeriveValue == 'string'
        ? [nameOrDeriveValue, maybeDeriveValue!]
        : ['ReactiveValue', nameOrDeriveValue];

    let [rerenderCount, setRerenderCount] = useState(1);

    let value: T | undefined;

    let watcher = watch(
        () => {
            let newSources: Set<ObservableValue<any>>;
            log('⚛ (render)', name, [], () => ({
                'Re-render count': rerenderCount,
                Sources: { get list() { return sourceTree(Array.from(newSources)); } }
            }), () => newSources = collectAccessedValues(() => value = deriveValue()));
        },
        name);

    let stopWatching = watcher.subscribe(() => {
        if (value !== undefined) {
            value = undefined;
            addReaction(() => setRerenderCount(c => c + 1));
        }
    });

    useEffect(() => () => {
        stopWatching();
        watcher.unsubscribeFromSources();
    });

    return value!;
}
