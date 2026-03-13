import { mock } from "bun:test";
import { IObserver, ISource } from "event-reduce/src/signals";

export class MockObserver<T> implements IObserver<T> {
    displayName = 'mock observer'
    sources = new Set<ISource<any>>()
    sourceUpdated: (source: ISource<T>, value: T) => void = mock<(source: ISource<T>, value: T) => void>()
}