import { asyncEvent, Atom, derive, event, IDerivation, IReduction, reduce } from "event-reduce"
import { isModel } from "event-reduce/lib/models"
import { trackManagedSourceCreation } from "event-reduce/lib/ownership"
import { Reduction } from "event-reduce/lib/reduction"
import { dispose, emptyArray } from "event-reduce/lib/utils"
import { DependencyList, useEffect, useMemo, useRef, useState } from "react"

/**
 * Creates a model that persists across renders of the component.
 * @param unobservableDependencies - A list of dependencies that are not observable. The model will be re-created when any of these change.
*/
export function useModel<T extends object>(createModel: () => T, unobservableDependencies?: DependencyList): T {
    let model = useMemo(createModel, unobservableDependencies ?? emptyArray)
    if (!isModel(model))
        throw new InvalidModelError()
    useEffect(() => () => model[dispose]?.(), unobservableDependencies ?? emptyArray)
    return model
}

export function useEvent<T>(name?: string) {
    return useState(() => event<T>(name))[0]
}

export function useAsyncEvent<Result = void, Context = void>(name?: string) {
    return useState(() => asyncEvent<Result, Context>(name))[0]
}

/**
 * Creates a derived value that persists across renders of the component.
 * @param unobservableDependencies - A list of dependencies that are not observable. The derived value will be updated when any of these change.
 */
export function useDerived<T>(getValue: () => T, name?: string): IDerivation<T>
export function useDerived<T>(getValue: () => T, unobservableDependencies?: DependencyList, name?: string): IDerivation<T>
export function useDerived<T>(getValue: () => T, nameOrUnobservableDependencies?: string | DependencyList, name?: string): IDerivation<T> {
    let unobservableDependencies: DependencyList | undefined
    [name, unobservableDependencies] = typeof nameOrUnobservableDependencies == 'string'
        ? [nameOrUnobservableDependencies, undefined]
        : [name, nameOrUnobservableDependencies]

    let derived = useState(() => derive(getValue, name))[0]

    useMemo(() => derived.update(getValue, 'render'), unobservableDependencies!)

    return derived
}

export function useReduced<T>(initial: T, name?: string): IReduction<T> {
    let sourceCreation = trackManagedSourceCreation() // It's fine for this reduction to be loose, because it will be disposed on unmount
    let reduction = useState(() => reduce(initial, name))[0]
    sourceCreation[dispose]()
    useEffect(() => () => (reduction as Reduction<T>)[dispose]?.(), [])
    return reduction
}

export function useObservedProps<T extends object>(values: T, name: string = '(anonymous observed values)') {
    let observableValues = useState(() => ({} as { [K in keyof T]?: Atom<T[K]> }))[0]
    let nameBase = (name || '') + '.'

    // Update any values that are already being observed
    useEffect(() => {
        for (let [key, atom] of Object.entries(observableValues) as [keyof T, Atom<T[keyof T]>][])
            atom.setValue(values[key])
    })

    let latestValues = useRef(values)
    latestValues.current = values

    // Create observable values as properties are accessed
    return new Proxy({} as T, {
        get(_, key) {
            return (observableValues[key as keyof T]
                ??= new Atom(nameBase + String(key),
                    (latestValues.current)[key as keyof T]))
                .value
        }
    })
}

export function useAtom<T>(value: T, name: string = '(anonymous observed value)') {
    let observableValue = useState(() => new Atom(name, value))[0]
    observableValue.setValue(value)
    return observableValue
}

class InvalidModelError extends Error {
    constructor() { super("Invalid model created in useModel. A model must be an instance of a class decorated with @model.") }
}
