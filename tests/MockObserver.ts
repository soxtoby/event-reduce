import { mock } from "bun:test";
import { IObserver, ISource } from "event-reduce/src/signals";

export class MockObserver<T> implements IObserver<T> {
    constructor(public displayName: string = 'mock observer') { }
    sources = new Set<ISource<any>>()
    sourceUpdated = mock<(source: ISource<T>, value: T) => void>()
}