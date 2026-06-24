import { asyncEvent, derive, event, type IDerivation, type IReduction, reduce, signal } from "event-reduce"
import { trackManagedObservableCreation } from "event-reduce/lib/ownership"
import { Reduction } from "event-reduce/lib/reduction"
import { isModel } from "event-reduce/lib/symbols"
import { dispose, emptyArray } from "event-reduce/lib/utils"
import { DependencyList, useEffect, useMemo, useState } from "react"

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
    let sourceCreation = trackManagedObservableCreation() // It's fine for this reduction to be loose, because it will be disposed on unmount
    let reduction = useState(() => reduce(initial, name))[0]
    sourceCreation[dispose]()
    useEffect(() => () => (reduction as Reduction<T>)[dispose]?.(), [])
    return reduction
}

export function useSignal<T>(initialValue: T, name: string = '(anonymous signal)') {
    return useState(() => signal(initialValue, name))[0]
}

class InvalidModelError extends Error {
    constructor() { super("Invalid model created in useModel. A model must be an instance of a class decorated with @model.") }
}
