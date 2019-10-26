import { Unsubscribe, watch } from "event-reduce";
import { log, sourceTree } from "event-reduce/lib/logging";
import { collectAccessedValues } from "event-reduce/lib/observableValue";
import { createElement, Fragment, FunctionComponent, memo, ReactElement, ReactNode, useRef, useState, useEffect } from "react";
import { useDispose, useOnce } from "./utils";

export function Derived(props: { name?: string; children: () => ReactNode; }) {
    return useDerivedRender(props.name || 'Derived', props.children);
}

export function derivedComponent<Component extends FunctionComponent<any>>(component: Component) {
    let componentName = component.displayName || component.name || 'Derived';
    let derived = ((...args: Parameters<Component>) => useDerivedRender(componentName, () => component(...args as [any]))) as Component;
    let memoed = memo<Component>(derived);
    memoed.displayName = componentName;
    return memoed;
}

export function useDerivedRender(render: () => ReactNode): ReactElement;
export function useDerivedRender(name: string, render: () => ReactNode): ReactElement;
export function useDerivedRender(renderOrName: string | (() => ReactNode), maybeRender?: () => ReactNode): ReactElement {
    let [name, render] = typeof renderOrName == 'string'
        ? [renderOrName, maybeRender!]
        : ['Derived', renderOrName];

    let [rerenderCount, setRerenderCount] = useState(1);

    let rendered: ReactNode;

    let watcher = watch(
        () => {
            let newSources = collectAccessedValues(() => rendered = render());
            log('⚛ (render)', name, [], () => ({ 'Re-render count': rerenderCount, Sources: sourceTree(Array.from(newSources)) }));
        },
        name);

    let stopWatching = watcher.subscribe(() => {
        if (rendered !== undefined) {
            rendered = undefined;
            setRerenderCount(c => c + 1);
        }
    });

    useEffect(() => () => {
        stopWatching();
        watcher.unsubscribeFromSources();
    });

    return createElement(Fragment, { children: rendered });
}
