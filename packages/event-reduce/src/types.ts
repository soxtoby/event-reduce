import type { IObservable } from "./observable";

export type Scoped<T, Scope extends Partial<T>> =
    & Omit<T, keyof Scope>
    & { [K in keyof Scope]?: K extends keyof T ? T[K] : never }

export type ObservedValue<Observable extends IObservable<any>> = Observable extends IObservable<infer T> ? T : never
