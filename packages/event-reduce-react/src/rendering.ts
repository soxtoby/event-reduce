import { Derivation } from "event-reduce/lib/derivation";
import { reactionQueue } from "event-reduce/lib/reactions";
import { ForwardRefExoticComponent, ForwardRefRenderFunction, Fragment, FunctionComponent, MemoExoticComponent, PropsWithChildren, PropsWithoutRef, ReactElement, ReactNode, RefAttributes, ValidationMap, WeakValidationMap, createElement, forwardRef, memo, useEffect, useState } from "react";
import { useAsObservableValues, useDerived } from "./hooks";

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

    let reactiveComponent = ((...args: Parameters<Component>) => { // Important to use rest operator here so react ignores function arity
        let [props, ...otherArgs] = args;
        let observableProps = useAsObservableValues(props, `${componentName}.props`);
        return useReactive(componentName, () => component(observableProps, ...otherArgs as [any]));
    }) as ReactiveComponent<Component>;
    reactiveComponent.displayName = componentName;

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

    let [, setRerenderCount] = useState(0);

    let derivedValue = useDerived(deriveValue, name) as Derivation<T>;

    useEffect(() => derivedValue.invalidation.subscribe(() => reactionQueue.current.add(() => setRerenderCount(r => r + 1))), []);

    derivedValue.update();
    return derivedValue.value;
}