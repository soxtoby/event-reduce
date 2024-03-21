import { IObservable, IObservableValue, Subject } from "event-reduce";
import { Derivation } from "event-reduce/lib/derivation";
import { LogValue } from "event-reduce/lib/logging";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { reactionQueue } from "event-reduce/lib/reactions";
import { dispose, nameOfFunction } from "event-reduce/lib/utils";
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

    useSyncExternalStore(useCallback(o => derivedValue.render.subscribe(o), []), () => derivedValue.render.value);

    return derivedValue;
}

function useRenderValue<T>(derivation: RenderedValue<T>, deriveValue: () => T) {
    useCallback(function update() { derivation.update(deriveValue, 'render', false); }, [deriveValue])(); // need to use a hook to be considered a hook in devtools
    return derivation.value;
}

class RenderedValue<T> extends Derivation<T> {
    public readonly render = new ObservableValue(() => `${this.displayName}.render`, { invalidatedBy: "(nothing)" });

    protected override onSourceValueChanged(source: IObservableValue<unknown>) {
        if (this._state == 'indeterminate') {
            this._state = 'invalid';
            reactionQueue.current.add(() => this.render.setValue({ invalidatedBy: source.displayName ?? "(unknown)" }));
        }
    }

    protected override getInvalidatedMessage() { return '⚛️🚩 (render invalidated)'; }

    protected override getUpdateMessage() { return '⚛️ (render)'; }

    protected override loggedValue(value: T) {
        if (process.env.NODE_ENV !== 'production' && isValidElement(value)) {
            let xmlDoc = document.implementation.createDocument(null, null);
            return new LogValue([
                xmlTree(value),
                { ['React element']: value }
            ]);

            function xmlTree<T>(node: T): Node {
                if (isValidElement(node)) {
                    let type = reactElementName(node.type)
                        .split('(').at(-1)!.split(')')[0]  // Unwrap HOC names
                        .replace(/^[0-9-]/, '_$&')  // Escape leading number or dash
                        .replace(/[^a-zA-Z0-9:_.-]/g, '_');  // Escape rest of element name
                    let el = xmlDoc.createElement(type);
                    for (let child of Children.toArray((node.props as any).children))
                        el.appendChild(xmlTree(child));
                    return el;
                }
                return document.createTextNode(String(node));
            }

            function reactElementName(elementType: any) {
                switch (typeof elementType) {
                    case 'string':
                        return elementType;
                    case 'function':
                        return nameOfFunction(elementType);
                    case 'symbol':
                        return String(elementType);
                    case 'object':
                        if ('_context' in elementType) return 'Context.Provider';
                        if (elementType.displayName) return elementType.displayName;
                        if (elementType.type?.displayName) return elementType.type.displayName;
                }
                return ':unknown:';
            }
        }
        return value;
    }
}