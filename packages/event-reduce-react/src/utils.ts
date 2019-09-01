import { useEffect, useRef } from "react";

export function useDispose(dispose: () => void) {
    useEffect(() => () => dispose(), []);
}

export function useOnce<T>(getValue: () => T) {
    let ref = useRef<T>(undefined!);
    if (ref.current === undefined)
        ref.current = getValue();
    return ref.current;
}