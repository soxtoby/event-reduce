export function filteredName(baseName: string, predicate: Function) {
    return `${baseName}.filter(${nameOf(predicate)})`;
}

export function scopedName(baseName: string, scope: object) {
    return `${baseName}.scoped({ ${Object.entries(scope).map(([k, v]) => `${k}: ${v}`).join(', ')} })`;
}

export function nameOf(fn: any) {
    return fn.name || fn.displayName || String(fn);
}

export function named<Proto extends object>(proto: Proto, getDisplayName: () => string) {
    return extend(proto, {
        get displayName() { return getDisplayName(); },
        set displayName(name: string) { getDisplayName = () => name; }
    })
}

export function extend<Super, Sub>(sup: Super, sub: Sub & ThisType<Super & Sub>): Super & Sub {
    return Object.defineProperties(sup, Object.getOwnPropertyDescriptors(sub));
}