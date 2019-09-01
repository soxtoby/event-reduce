import { watch } from "event-reduce";
import { ReactElement, useEffect, useRef, useState } from "react";
import { useOnce } from "./utils";

export function Derived(props: { children: () => ReactElement<any> | null }) {
    return useDerivedRender(props.children);
}

export function useDerivedRender(render: () => ReactElement<any> | null) {
    let [renderCount, setRenderCount] = useState(0);

    let rendered = useRef<ReactElement<any> | null>(null);

    let renderWatcher = useOnce(() => watch(() => rendered.current = render()));

    useEffect(() => {
        let stopWatching = renderWatcher.subscribe(() => {
            stopWatching();
            setRenderCount(renderCount + 1);
            renderWatcher.run();
        });
        return () => stopWatching();
    });

    return rendered.current;
}

