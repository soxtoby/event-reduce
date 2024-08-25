import { useState } from "react";

export function useOnce<T>(getValue: () => T) {
    return useState(getValue)[0];
}