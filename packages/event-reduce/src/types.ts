import type { IObservable } from "./observable";

export type Scoped<T, Scope extends Partial<T>> =
    & Omit<T, keyof Scope>
    & { [K in keyof Scope]?: K extends keyof T ? T[K] : never }

export type MergedObservables<Sources extends IObservable<any>[]> = IObservable<MergedValues<Sources>>

type MergedValues<Sources extends IObservable<any>[]> =
    Sources extends [IObservable<infer First>, ...infer Rest extends IObservable<any>[]]
    ? First | MergedValues<Rest>
    : never

export type ObservedValue<Observable extends IObservable<any>> = Observable extends IObservable<infer T> ? T : never
