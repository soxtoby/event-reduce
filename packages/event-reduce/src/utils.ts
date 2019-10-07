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
export class Named {
    constructor(private _getDisplayName: () => string) { }

    get displayName() { return this._getDisplayName(); }
    set displayName(name: string) { this._getDisplayName = () => name; }
}