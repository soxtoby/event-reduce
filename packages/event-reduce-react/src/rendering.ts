import { nameOfFunction } from "event-reduce";
import { Derivation } from "event-reduce/lib/derivation";
import { LogValue } from "event-reduce/lib/logging";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { reactionQueue } from "event-reduce/lib/reactions";
import { dispose } from "event-reduce/lib/utils";
import { Children, Fragment, ReactElement, ReactNode, createElement, isValidElement, useCallback, useEffect } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import { useDispose, useOnce } from "./utils";

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
    // Using a bogus derive function because we'll provide a new one every render
    let derivedValue = useOnce(() => new RenderedValue<T>(() => name, () => undefined!));
    useDispose(() => derivedValue[dispose]());

    let render = useOnce(() => new ObservableValue(() => `${name}.render`, { invalidatedBy: "(nothing)" }));

    useEffect(() => derivedValue.subscribe(() => {
        let invalidatedBy = derivedValue.invalidatedBy ?? "(unknown)";
        reactionQueue.current.add(() => {
            if (derivedValue.invalidatedBy == invalidatedBy) // Avoid unnecessary renders
                render.setValue({ invalidatedBy })
        });
    }), []);

    useSyncExternalStore(useCallback(o => render.subscribe(o), []), () => render.value);

    return derivedValue;
}

function useRenderValue<T>(derivation: RenderedValue<T>, deriveValue: () => T) {
    useCallback(function update() { derivation.update(deriveValue, 'render'); }, [deriveValue])(); // need to use a hook to be considered a hook in devtools
    return derivation.value;
}

class RenderedValue<T> extends Derivation<T> {
    protected override updatedEvent = '⚛️ (render)';
    protected override invalidatedEvent = '⚛️🚩 (render invalidated)';
    protected override loggedValue(value: T) {
        if (process.env.NODE_ENV !== 'production' && isValidElement(value)) {
            let xmlDoc = document.implementation.createDocument(null, null);
            return new LogValue([
                xmlTree(value),
                { ['React element']: value }
            ]);

            function xmlTree<T>(node: T): Node {
                if (isValidElement(node)) {
                    let type = ((typeof node.type == 'string' ? node.type
                        : typeof node.type == 'function' ? nameOfFunction(node.type)
                            : typeof node.type == 'symbol' ? String(node.type)
                                : ':unknown:')
                        .split('(').at(-1)!.split(')')[0])  // Unwrap HOC names
                        .replace(/^[0-9-]/, '_$&')  // Escape leading number or dash
                        .replace(/[^a-zA-Z0-9:_-]/g, '_');  // Escape rest of element name
                    let el = xmlDoc.createElement(type);
                    for (let child of Children.toArray((node.props as any).children))
                        el.appendChild(xmlTree(child));
                    return el;
                }
                return document.createTextNode(String(node));
            }
        }
        return value;
    }
}