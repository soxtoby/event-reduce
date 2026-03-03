import { dispose } from "../utils"
import { ISource, SourceObserverBase } from "./signals"
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

    return new Reduction(displayName ?? "(anonymous reduction)", Object.is, events)
}

export type Reducer<Result, Source> = (current: Result, next: Source) => Result

export class Reduction<T, Events = void> extends SourceObserverBase<T, T> {
    sources = new Set<ISource<any>>()
    private _reducers = new Map<ISource<any>, (current: T, next: any) => T>()
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