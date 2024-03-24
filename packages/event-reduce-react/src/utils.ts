import { useEffect, useState } from "react";

export function useDispose(dispose: () => void) {
    useEffect(() => () => dispose(), []);
}

export function useOnce<T>(getValue: () => T) {
    let [value] = useState(getValue);
    return value;
}