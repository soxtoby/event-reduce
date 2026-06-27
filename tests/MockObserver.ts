import { mock } from "bun:test"
import { IObservable, IObserver } from "event-reduce"

export class MockObserver<T> implements IObserver<T> {
    displayName = 'mock observer'
    sources = new Set<IObservable<any>>()
    sourceUpdated: (observable: IObservable<T>, value: T) => void = mock<(observable: IObservable<T>, value: T) => void>()
}
