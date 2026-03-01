import { dispose } from "../utils"
import { Source, SourceObserverBase } from "./signals"
import { currentOwnerScope } from "./tracking"

export type Reducer<Result, Source> = (current: Result, next: Source) => Result


export class Reduction<T, Events = void> extends SourceObserverBase<T, T> {
    sources = new Set<Source<any>>()
    private _reducers = new Map<Source<any>, (current: T, next: any) => T>()
    private _attached = false
    private _disposed = false

    constructor(
        displayName: string,
        isEqual = Object.is,
        private _events?: Events
    ) {
        super(displayName, isEqual)

        if (!currentOwnerScope())
            throw new OwnerlessReductionError(displayName)

        this.attach()
    }

    on<S>(source: Source<S>, reduce: Reducer<T, S>): this
    on<S>(getSource: (events: Events) => Source<S>, reduce: Reducer<T, S>): this
    on<S>(source: Source<S> | ((events: Events) => Source<S>), reduce: Reducer<T, S>) {
        if (!('lastUpdated' in source))
            source = source(this._events!)

        this.sources.add(source)
        this._reducers.set(source, reduce)

        if (this._attached)
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

    protected override attach() {
        if (this._attached || this._disposed)
            return

        for (let source of this.sources)
            source.subscribe(this)

        this._attached = true
    }

    protected override detach() {
        if (!this._attached)
            return

        for (let source of this.sources)
            source.unsubscribe(this)

        this._attached = false
    }

    [dispose]() {
        if (this._disposed)
            return

        this._disposed = true
        this.detach()
    }
}

export class OwnerlessReductionError extends Error {
    constructor(reductionName: string) { super(`Reduction '${reductionName}' created without an owner.`) }
}