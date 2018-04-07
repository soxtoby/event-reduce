export type State<T> =
    T extends Function ? never
    : T extends Array<infer U> ? StateArray<U>
    : T extends object ? StateObject<T>
    : T;

export interface StateArray<T> extends Array<State<T>> { }
export type StateObject<T> = { [P in keyof T]: State<T[P]> };

const statePropsKey = Symbol('stateProps');

export function state(target: any, key: string) {
    let stateProps = (target[statePropsKey] || (target[statePropsKey] = [])) as string[];
    stateProps.push(key);
}

export function plainState<T>(model: T): State<T> {
    if (typeof model != 'object')
        return model;

    if (Array.isArray(model))
        return model.map(plainState) as State<T>;

    let stateProps = (model as any)[statePropsKey] as string[]
        || Object.keys(model);

    let state = {} as StateObject<T>;
    stateProps.forEach(key => {
        let value = model[key as keyof T];
        if (typeof value != 'function')
            state[key as keyof T] = plainState(value);
    });
    return state as State<T>;
}