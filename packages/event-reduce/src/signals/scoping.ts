import { isObject } from "../utils"

export function applyScope<T, S extends DeepPartial<T>>(target: Scoped<T, S>, scope: S): T {
    if (isObject(target) && isObject(scope)) {
        if (Array.isArray(target) && Array.isArray(scope)) {
            let result = target.slice() as any
            scope.forEach((s, i) => result[i] = applyScope(result[i], s))
            return result
        } else {
            let result = Object.create(target) as any
            Object.entries(scope)
                .forEach(([key, scopeValue]) => result[key] = applyScope((target as any)[key], scopeValue as any))
            return result
        }
    } else {
        return target ?? scope as any
    }
}

export function matchesScope(value: unknown, scope: unknown): boolean {
    if (isObject(scope)) {
        if (Array.isArray(scope))
            return Array.isArray(value)
                && scope.every((s, i) => matchesScope((value as any)[i], s))
        else
            return isObject(value)
                && Object.entries(scope).every(([key, scopeValue]) => matchesScope((value as any)[key], scopeValue))
    }

    return Object.is(scope, value)
}

export type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] }

export type Scoped<T, Scope extends DeepPartial<T>> =
    T extends object
    ? (
        // Properties not in scope
        & { [P in keyof T as P extends keyof Scope ? never : P]: T[P] }
        // Non-objects in scope
        & { [P in keyof T as P extends keyof Scope ? T[P] extends object ? never : P : never]: T[P] }
        // Objects partially specified in scope
        & { [P in keyof T as P extends keyof Scope ? T[P] extends object ? Scope[P] extends T[P] ? never : P : never : never]: T[P] extends object ? Scope[P] extends object ? Prettify<Scoped<T[P], Scope[P]>> : never : never }
        // Objects fully specified in scope
        & { [P in keyof T as P extends keyof Scope ? T[P] extends object ? Scope[P] extends T[P] ? P : never : never : never]?: T[P] extends object ? Scope[P] extends object ? Prettify<Scoped<T[P], Scope[P]>> : never : never }
    )
    : T

type Prettify<T> = { [K in keyof T]: T[K]; } & {}