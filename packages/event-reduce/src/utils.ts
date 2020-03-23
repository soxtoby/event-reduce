import { getObservableProperties } from "./decorators";
import { getStateProperties } from "./state";

export function filteredName(baseName: string, predicate: Function) {
    return `${baseName}.filter(${nameOfFunction(predicate)})`;
}

export function scopedName(baseName: string, scope: object) {
    return `${baseName}.scoped({ ${Object.entries(scope).map(([k, v]) => `${k}: ${v}`).join(', ')} })`;
}

export function nameOfFunction(fn: Function) {
    return (fn as any).displayName || fn.name || String(fn);
}

/** Utility base class for anything with a dynamic displayName */
export class NamedBase {
    constructor(private _getDisplayName: () => string) { }

    get displayName() { return this._getDisplayName(); }
    set displayName(name: string) { this._getDisplayName = () => name; }
}

export function matchesScope<Scope>(scope: Scope): <Value>(value: Value) => boolean;
export function matchesScope<Scope, Value>(scope: Scope, value: Value): boolean;
export function matchesScope<Scope, Value>(scope: Scope, value?: Value) {
    return arguments.length == 2
        ? matchesScope(scope)(value)
        : <Value extends Scope>(value: Value) => Object.entries(scope)
            .every(([k, v]) => value[k as keyof Scope] === v);
}

export function isModel(model: any) {
    return isObject(model)
        && (!!getObservableProperties(Object.getPrototypeOf(model))
            || !!getStateProperties(model));
}

export function isPlainObject(value: any) {
    return isObject(value)
        && Object.getPrototypeOf(value) == Object.prototype;
}

export function isObject(value: any) {
    return value && typeof value == 'object';
}