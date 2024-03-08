export function filteredName(baseName: string, predicate: Function) {
    return `${baseName}.filter(${nameOfCallback(predicate)})`;
}

export function scopedName(baseName: string, scope: object) {
    return `${baseName}.scoped({ ${Object.entries(scope).map(([k, v]) => `${k}: ${v}`).join(', ')} })`;
}

/** Returns explicit name of function, falling back to function content. */
export function nameOfCallback(fn: Function) {
    return nameOfFunction(fn) || String(fn);
}

/** Returns explicit name of function. */
export function nameOfFunction(fn: Function) {
    return (fn as any).displayName as string || fn.name;
}

export function jsonPath(keys: readonly PropertyKey[]) {
    return keys.map((key, i) =>
        i == 0 ? key
            : typeof key == 'number' || typeof key == 'symbol' ? `[${String(key)}]`
                : /^[\w\$]+$/.test(key) ? `.${key}`
                    : `[${JSON.stringify(key)}]`)
        .join('');
}

/** Utility base class for anything with a dynamic displayName */
export class NamedBase {
    constructor(private _getDisplayName: () => string) { }

    get displayName() { return this._getDisplayName(); }
    set displayName(name: string) { this._getDisplayName = () => name; }
}

export function matchesScope<Scope extends object>(scope: Scope): <Value>(value: Value) => boolean;
export function matchesScope<Scope extends object, Value>(scope: Scope, value: Value): boolean;
export function matchesScope<Scope extends object, Value>(scope: Scope, value?: Value) {
    return arguments.length == 2
        ? matchesScope(scope)(value)
        : <Value extends Scope>(value: Value) => Object.entries(scope)
            .every(([k, v]) => value[k as keyof Scope] === v);
}

export function isPlainObject<T>(value: T): value is T & object {
    return isObject(value)
        && Object.getPrototypeOf(value) == Object.prototype;
}

export function isObject<T>(value: T): value is T & object {
    return !!value && typeof value == 'object';
}

export function getOrAdd<T>(target: any, key: string | symbol, create: (base: T | undefined) => T): T {
    return target.hasOwnProperty(key)
        ? target[key]
        : (target[key] = create(target[key]));
}

export function firstIntersection<T>(a: Set<T>, b: Set<T>) {
    for (let item of a)
        if (b.has(item))
            return item;
}

export const dispose: typeof Symbol.dispose = Symbol.dispose ?? Symbol('Symbol.dispose');