import { dispose, isDisposable, isObject } from "../utils"
import { ISource, isSource } from "./signals"
import { getChildNodes, trackAccessedSources, trackManagedSourceCreation, updateChildren } from "./tracking"

export const modelProperties = Symbol('model properties')
export const eventsBrand = Symbol('events class')

export interface Model extends Disposable {
    [modelProperties]: Record<PropertyKey, ModelProperty>
}

export type ModelProperty = ISource<any> | StateProperty

export interface EventsClass {
    [eventsBrand]: true
}

export function isModel(value: unknown): value is Model {
    return isObject(value)
        && modelProperties in value
}

export function isEventsClass(value: unknown): value is EventsClass {
    return value instanceof Object
        && eventsBrand in value
}

export class StateProperty implements Disposable {
    constructor(
        private _instance: any,
        public readonly key: PropertyKey
    ) {
        updateChildren(_instance, null, this.value)
    }

    toJSON() { return this.value }

    get value() { return this._instance[this.key] }

    [dispose]() {
        updateChildren(this._instance, this.value, null)
    }
}

export function createModel<T extends object>(create: () => T): T & Model {
    let sourceCreation = trackManagedSourceCreation()
    let accesses = trackAccessedSources(null) // Don't want anything accessed during construction to become a source for whatever is creating this
    try {
        let instance = create()
        if (isModel(instance))
            return instance
        let model = Object.create(instance, {
            [modelProperties]: {
                value: Object.fromEntries(
                    getChildNodes(instance)
                        .entries()
                        .flatMap(([node, path]) => isSource(node) ? [[path, node]] : []))
            },
            [dispose]: {
                value() {
                    Object.values(this[modelProperties])
                        .forEach(p => (p as any as Disposable)[dispose]?.())
                    if (isDisposable(instance))
                        instance[dispose]()
                }
            }
        })
        updateChildren(model, null, instance)
        sourceCreation.verifySourceManagement()
        return model
    } finally {
        accesses[dispose]()
        sourceCreation[dispose]()
    }
}