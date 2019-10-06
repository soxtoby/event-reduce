export function matchesScope<Scope>(scope: Scope): <Value>(value: Value) => boolean;
export function matchesScope<Scope, Value>(scope: Scope, value: Value): boolean;
export function matchesScope<Scope, Value>(scope: Scope, value?: Value) {
    return arguments.length == 2
        ? matchesScope(scope)(value)
        : <Value extends Scope>(value: Value) => Object.entries(scope)
            .every(([k, v]) => value[k as keyof Scope] === v);
}