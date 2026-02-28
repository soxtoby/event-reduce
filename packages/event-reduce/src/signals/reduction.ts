import { Source, SourceObserverBase } from "./signals"

export type Reducer<Result, Source> = (current: Result, next: Source) => Result

export class Reduction<T, Events = void> extends SourceObserverBase<T, T> {
    sources = new Set<Source<any>>()
    private _reducers = new Map<Source<any>, (current: T, next: any) => T>()

    constructor(
        displayName: string,
        isEqual = Object.is,
        private _events?: Events
    ) { super(displayName, isEqual) }

    on<S>(source: Source<S>, reduce: Reducer<T, S>): this
    on<S>(getSource: (events: Events) => Source<S>, reduce: Reducer<T, S>): this
    on<S>(source: Source<S> | ((events: Events) => Source<S>), reduce: Reducer<T, S>) {
        if (!('lastUpdated' in source))
            source = source(this._events!)

        this.sources.add(source)
        this._reducers.set(source, reduce)
        
        if (this._observers.size)
            source.subscribe(this)

        return this
    }

    override get value() { return super.value }

    sourceUpdated<S>(source: Source<S>, value: S) {
        let reduce = this._reducers.get(source)
        if (reduce) {
            let newValue = reduce(this._value, value)
            this.setValue(newValue)
        }
    }
}