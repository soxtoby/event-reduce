import { watch } from "event-reduce";
import { log } from "event-reduce/lib/logging";
import { ReactElement, useEffect, useRef, useState, FunctionComponent } from "react";
import { useOnce } from "./utils";

export function Derived(props: { name?: string; children: () => ReactElement | null; }) {
    return useDerivedRender(props.children, props.name);
}

export function deriveRender<P>(component: FunctionComponent<P>) {
    let displayName = component.displayName || component.name || 'Derived';
    return Object.assign((props: P) => useDerivedRender(() => component(props), displayName), { displayName });
}

export function useDerivedRender(render: () => ReactElement | null, name = 'Derived') {
    let [renderCount, setRenderCount] = useState(1);

    let rendered = useRef<ReactElement | null | undefined>(undefined);

    let renderWatcher = useOnce(() =>
        watch((renderCount) =>
            log('⚛ (render)', name, [], { 'Render count': renderCount },
                () => rendered.current = render()),
            renderCount,
            name));

    useEffect(() => {
        let stopWatching = renderWatcher.subscribe(() => {
            stopWatching();
            rendered.current = undefined;
            setRenderCount(c => c + 1);
        });
        return () => stopWatching();
    });

    if (rendered.current == undefined)
        renderWatcher.run(renderCount);

    return rendered.current as ReactElement | null;
}
