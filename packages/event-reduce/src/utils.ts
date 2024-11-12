import { Unsubscribe } from "./types";

export const emptyArray = Object.freeze([]) as readonly any[];

export function constant<T>(value: T) { return returnValue.bind(null, value) as () => T; }
function returnValue<T>(value: T) { return value; }

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
    set displayName(name: string) { this._getDisplayName = constant(name); }

    /** Just for avoiding unnecessary arrow functions, but importantly reflects changes to the _getDisplayName callback. */
    protected readonly displayNameGetter = () => this._getDisplayName();
}

export function matchesScope<Scope extends object>(scope: Scope): <Value>(value: Value) => boolean;
export function matchesScope<Scope extends object, Value>(scope: Scope, value: Value): boolean;
export function matchesScope<Scope extends object, Value>(scope: Scope, value?: Value) {
    return arguments.length == 2
        ? matchesScope(scope)(value)
        : <Value extends Scope>(value: Value) => Object.entries(scope)
            .every(([k, v]) => value[k as keyof Scope] === v);
}

export function argsAre<Checks extends TypeCheck<any>[]>(args: any[], ...typeChecks: Checks): args is CheckedTypes<Checks> {
    return typeChecks.length <= args.length
        && typeChecks.every((typeCheck, i) => typeCheck(args[i]))
        && args.slice(typeChecks.length).every(arg => arg === undefined);
}

type TypeCheck<T> = (value: any) => value is T;

type CheckedTypes<Checks extends TypeCheck<any>[]> = Checks extends [TypeCheck<infer First>, ...infer Rest extends TypeCheck<any>[]]
    ? [First, ...CheckedTypes<Rest>]
    : [];

export function isFunction(value: any): value is Function {
    return typeof value == 'function';
}

export function isPlainObject<T>(value: T): value is T & object {
    return isObject(value)
        && Object.getPrototypeOf(value) == Object.prototype;
}

export function isObject<T>(value: T): value is T & object {
    return !!value && typeof value == 'object';
}

export function isString(value: any): value is string {
    return typeof value == 'string';
}

export function isUndefined(value: any): value is undefined {
    return value === undefined;
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

export function getAllPropertyDescriptors(obj: unknown) {
    let props = new Map<string, PropertyDescriptor>();
    while (obj != Object.prototype) {
        Object.entries(Object.getOwnPropertyDescriptors(obj))
            .filter(([key]) => !props.has(key))
            .forEach(([key, property]) => props.set(key, property));
        obj = Object.getPrototypeOf(obj);
    }
    return props;
}

export function unsubscribeAll(unsubscribes: Unsubscribe[]) {
    for (let unsubscribe of unsubscribes)
        unsubscribe();
}

export const dispose: typeof Symbol.dispose = Symbol.dispose ?? Symbol('Symbol.dispose');

/** Shim for `using` declaration until it's properly supported. */
export function using<Resource extends Disposable>(disposable: Resource, action: (resource: Resource) => void) {
    try {
        action(disposable);
    } finally {
        disposable[dispose]();
    }
}