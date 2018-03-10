import { action, IObservableAction } from "./action";

export function serialize<T>(model: T): T {
    if (typeof model != 'object')
        return model;

    let serialized = {} as T;
    Object.keys(model).forEach(key => {
        let value = model[key as keyof T];
        if (typeof value != 'function')
            serialized[key as keyof T] = serialize(value);
    });
    return serialized;
}

const deserializeAction = action<any>();
export function deserialize<T>() { return deserializeAction as IObservableAction<T, T>; }