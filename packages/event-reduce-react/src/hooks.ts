import { asyncEvent, derive, event, type IDerivation, type IReduction, reduce, signal } from "event-reduce"
import { trackManagedObservableCreation } from "event-reduce/lib/ownership"
import { isModel } from "event-reduce/lib/symbols"
import { dispose, emptyArray } from "event-reduce/lib/utils"
import { DependencyList, useEffect, useMemo, useReducer, useRef, useState } from "react"

/**
 * Creates a model that persists across renders of the component, and disposes it when the component unmounts.
 * The model's state isn't kept while the component is hidden by an `<Activity>`: the model is disposed, and a new one is created when it's visible again.
 * @param unobservableDependencies - A list of dependencies that are not observable. The model will be re-created when any of these change.
*/
export function useModel<T extends object>(createModel: () => T, unobservableDependencies?: DependencyList): T {
    return useDisposable(() => {
        let model = createModel()
        if (!isModel(model))
            throw new InvalidModelError()
        return model
    }, unobservableDependencies ?? emptyArray)
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

/**
 * Creates a reduction that persists across renders of the component, and disposes it when the component unmounts.
 * The reduction's value isn't kept while the component is hidden by an `<Activity>`: the reduction is disposed, and a new one is created when it's visible again.
 */
export function useReduced<T>(initial: T, name?: string): IReduction<T> {
    return useDisposable(() => {
        let sourceCreation = trackManagedObservableCreation() // It's fine for this reduction to be loose, because it will be disposed on unmount
        try {
            return reduce(initial, name)
        } finally {
            sourceCreation[dispose]()
        }
    }, emptyArray)
}

export function useSignal<T>(initialValue: T, name: string = '(anonymous signal)') {
    return useState(() => signal(initialValue, name))[0]
}

/**
 * Creates a value that persists across renders, and disposes it when the component unmounts or the dependencies change.
 * React can clean up effects and then run them again without re-rendering, such as Strict Mode's simulated unmount,
 * or when an <Activity> is hidden and shown again, so a value that has been disposed is replaced with a new one.
 */
function useDisposable<T extends Disposable>(create: () => T, dependencies: DependencyList): T {
    let [generation, recreate] = useReducer((n: number) => n + 1, 0)
    let value = useMemo(create, [generation, ...dependencies])
    let disposedValue = useRef<T>(undefined)

    useEffect(() => {
        if (disposedValue.current == value)
            recreate()
        else
            return () => {
                disposedValue.current = value
                value[dispose]()
            }
    }, [value])

    return value
}

class InvalidModelError extends Error {
    constructor() { super("Invalid model created in useModel. A model must be an instance of a class decorated with @model.") }
}
