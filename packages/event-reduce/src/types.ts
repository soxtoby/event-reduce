import type { ISource } from "./sources";

export type Scoped<T, Scope extends Partial<T>> =
    & Omit<T, keyof Scope>
    & { [K in keyof Scope]?: K extends keyof T ? T[K] : never }

export type MergedSources<Sources extends ISource<any>[]> = ISource<MergedValues<Sources>>

type MergedValues<Sources extends ISource<any>[]> =
    Sources extends [ISource<infer First>, ...infer Rest extends ISource<any>[]]
    ? First | MergedValues<Rest>
    : never

export type SourceValue<Source extends ISource<any>> = Source extends ISource<infer T> ? T : never
