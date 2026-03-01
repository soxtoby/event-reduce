export type Model = { [modelBrand]: true }
const modelBrand = Symbol('signal model')

export function asModel<T extends object>(value: T): T & Model {
    Object.defineProperty(value, modelBrand, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false
    })

    return value as T & Model
}

export function isModel(value: unknown): value is Model {
    return !!value
        && typeof value == 'object'
        && modelBrand in value
}
