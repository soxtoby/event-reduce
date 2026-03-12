import { dispose, emptyArray } from "../utils"
import { derive, IDerivation } from "./derivation"
import { startLogging } from "./logging"
import { IObserver, ISource, IValueSource, SourceBase } from "./signals"
import { getState, State } from "./state"
import { currentIteration, managedSourceCreated, trackSourceAccessed, collectAccessedSources, updateChildren } from "./tracking"

export interface IReduction<T, Events = void> extends IValueSource<T> {
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

export class Reduction<T, Events = void> extends SourceBase<T> implements IReduction<T, Events>, IObserver<any> {
    sources = new Set<ISource<any>>()
    private _reducers = new Map<ISource<any>, (current: T, next: any) => T>()
    private _sourcesLastChecked = -1
    private _json: IDerivation<State<T>>

    constructor(
        displayName: string,
        initialValue: T,
        private _isEqual = Object.is,
        private _events?: Events
    ) {
        super(displayName)

        this._json = derive(() => getState(this.value), `toJSON(${this.displayName})`)

        managedSourceCreated(this)

        this._value = initialValue
        updateChildren(this, null, initialValue)
    }

    toJSON() { return this._json.value; }

    on<S>(source: ISource<S>, reduce: Reducer<T, S>): this
    on<S>(getSource: (events: Events) => ISource<S>, reduce: Reducer<T, S>): this
    on<S>(source: ISource<S> | ((events: Events) => ISource<S>), reduce: Reducer<T, S>) {
        if (!('lastUpdated' in source))
            source = source(this._events!)

        source.subscribe(this)
        this.sources.add(source)
        this._reducers.set(source, reduce)

        return this
    }

    sourceUpdated<S>(source: ISource<S>, value: S) {
        if (source.lastUpdated > this.lastUpdated) {
            let reduce = this._reducers.get(source)
            if (reduce) {
                let tracker = collectAccessedSources(this) // Required for detecting circular references in reducers
                let previousValue = this._value
                let nextValue!: T
                let logging = startLogging('🧪 (reduction)', this.displayName, emptyArray, () => ({
                    Previous: previousValue,
                    Current: nextValue,
                    // Container: this.container,
                    // Sources: sourceTree(this.sources)
                }))

                try {
                    this.setValue(nextValue = reduce(this._value, value))
                } finally {
                    logging?.[dispose]()
                    tracker[dispose]()
                }
            }
        }
    }

    override get value() {
        let access = trackSourceAccessed(this) // Notifying tracker before checking for updates so circular reference is detected early

        try {
            if (this._sourcesLastChecked < currentIteration)
                for (let source of this.sources) // At most one source should be newer
                    this.sourceUpdated(source, (source as SourceBase<any>).value)
        } finally {
            access[dispose]()
        }

        return this._value // Not using super.value to avoid duplicate tracker notification
    }

    override setValue(value: T) {
        this._sourcesLastChecked = currentIteration
        super.setValue(value)
    }

    override skipUpdate(nextValue: T) { return this._isEqual(this._value, nextValue) }

    override[dispose]() {
        for (let source of this.sources)
            source.unsubscribe(this)
        super[dispose]()
    }
}