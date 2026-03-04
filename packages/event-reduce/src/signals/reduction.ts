import { dispose } from "../utils"
import { globalVersion, ISource, SourceBase, SourceObserverBase, SourceTracker, trackSourceAccessed } from "./signals"
import { currentOwnerScope } from "./tracking"

export interface IReduction<T, Events> extends ISource<T> {
    readonly value: T
    on<S>(source: ISource<S>, reduce: Reducer<T, S>): this
    on<S>(getSource: (events: Events) => ISource<S>, reduce: Reducer<T, S>): this
}

export function reduce<T>(initialValue: T, displayName?: string): IReduction<T, void>
export function reduce<T, Events>(initialValue: T, events: Events, displayName?: string): IReduction<T, Events>
export function reduce<T, Events>(initialValue: T, eventsOrDisplayName?: Events | string, maybeDisplayName?: string): IReduction<T, Events> {
    let [events, displayName] = typeof eventsOrDisplayName == 'string'
        ? [undefined as Events, eventsOrDisplayName]
        : [eventsOrDisplayName, maybeDisplayName]

    return new Reduction(displayName ?? "(anonymous reduction)", initialValue, Object.is, events)
}

export type Reducer<Result, Source> = (current: Result, next: Source) => Result

export class Reduction<T, Events = void> extends SourceObserverBase<T, T> {
    sources = new Set<ISource<any>>()
    private _reducers = new Map<ISource<any>, (current: T, next: any) => T>()
    private _sourcesLastChecked = -1
    private _attached = false
    private _disposed = false

    constructor(
        displayName: string,
        initialValue: T,
        private _isEqual = Object.is,
        private _events?: Events
    ) {
        super(displayName)

        if (!currentOwnerScope())
            throw new OwnerlessReductionError(displayName)

        this._value = initialValue
        this.attach()
    }

    on<S>(source: ISource<S>, reduce: Reducer<T, S>): this
    on<S>(getSource: (events: Events) => ISource<S>, reduce: Reducer<T, S>): this
    on<S>(source: ISource<S> | ((events: Events) => ISource<S>), reduce: Reducer<T, S>) {
        if (!('lastUpdated' in source))
            source = source(this._events!)

        this.sources.add(source)
        this._reducers.set(source, reduce)

        if (this._attached)
            source.subscribe(this)

        return this
    }

    sourceUpdated<S>(source: ISource<S>, value: S) {
        if (source.lastUpdated > this.lastUpdated) {
            let reduce = this._reducers.get(source)
            if (reduce) {
                let tracker = new SourceTracker(this) // Required for detecting circular references in reducers
                try {
                    let newValue = reduce(this._value, value)
                    this.setValue(newValue)
                } finally {
                    tracker[dispose]()
                }
            }
        }
    }

    override get value() {
        // Notifying tracker before checking for updates so circular reference is detected early
        trackSourceAccessed(this)

        if (this._sourcesLastChecked < globalVersion)
            for (let source of this.sources) // At most one source should be newer
                this.sourceUpdated(source, (source as SourceBase<any>).value)

        return this._value // Not using super.value to avoid duplicate tracker notification
    }

    override setValue(value: T) {
        super.setValue(value)
        this._sourcesLastChecked = globalVersion
    }

    override skipUpdate(nextValue: T) { return this._isEqual(this._value, nextValue) }

    // NOCOMMIT shouldn't be required for reductions
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