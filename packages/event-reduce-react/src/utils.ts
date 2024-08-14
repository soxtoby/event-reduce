import { constant, emptyArray } from "event-reduce/lib/utils";
import { useEffect, useState } from "react";

export function useDispose(dispose: () => void) {
    useEffect(constant(dispose), emptyArray);
}

export function useOnce<T>(getValue: () => T) {
    return useState(getValue)[0];
}