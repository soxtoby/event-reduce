export function matchesScope<Scope>(scope: Scope) {
    return <Value extends Scope>(value: Value) => Object.entries(scope)
        .every(([k, v]) => value[k as keyof Scope] === v);
}