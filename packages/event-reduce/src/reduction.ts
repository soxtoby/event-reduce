import { Derivation } from "./derivation"
import { startLogging } from "./logging"
import { allSources, IObservable, IObserver, isObservable, NoUnderlyingObservableError, Observable } from "./observable"
import { managedObservableCreated, updateChildren } from "./ownership"
import { getState, State } from "./state"
import { collectAccessedSources, currentIteration, endSourceAccessed, getUnderlyingObservable, startSourceAccessed } from "./tracking"
import { dispose, emptyArray } from "./utils"

export interface IReduction<T, Events = void> extends IObservable<T> {
    readonly value: T
    on<S>(getSource: (events: Events) => IObservable<S>, reduce: Reducer<T, S>): this
    on<S>(source: IObservable<S>, reduce: Reducer<T, S>): this
}

export function reduce<T>(initialValue: T, displayName?: string): IReduction<T, void>
export function reduce<T, Events>(initialValue: T, events: Events, displayName?: string): IReduction<T, Events>
export function reduce<T, Events>(initialValue: T, eventsOrDisplayName?: Events | string, maybeDisplayName?: string): IReduction<T, Events> {
    let [events, displayName] = typeof eventsOrDisplayName == 'string'
        ? [undefined as Events, eventsOrDisplayName]
        : [eventsOrDisplayName, maybeDisplayName]

    return new Reduction(displayName ?? Reduction.defaultName, initialValue, Object.is, events)
}

/** Extends an existing Observable with reduction capabilities. */
export function extendReduce<T>(observableValue: T, displayName?: string): IReduction<T, void> {
    let observable = getUnderlyingObservable(observableValue)
    if (observable)
        return reduce(observableValue, displayName ?? observable.displayName).on(observable, (_, val) => val)
    throw new NoUnderlyingObservableError(observableValue)
}

export type Reducer<Result, Next> = (current: Result, next: Next) => Result

export class Reduction<T, Events = void> extends Observable<T> implements IReduction<T, Events>, IObserver<any> {
    private readonly _sources = new Set<IObservable<any>>()
    private _reducers = new Map<IObservable<any>, (current: T, next: any) => T>()
    private _sourcesLastChecked = -1
    private _json: Derivation<State<T>>
    static defaultName = "(anonymous reduction)"

    constructor(
        displayName: string,
        initialValue: T,
        private _isEqual = Object.is,
        private _events?: Events
    ) {
        super(displayName)

        this._json = new Derivation(`toJSON(${this.displayName})`, () => getState(this.value))
        this._json.suppressLogging = true

        managedObservableCreated(this)

        this._value = initialValue
        updateChildren(this, null, initialValue)
    }

    toJSON() { return this._json.value; }

    on<S>(source: IObservable<S>, reduce: Reducer<T, S>): this
    on<S>(getSource: (events: Events) => IObservable<S>, reduce: Reducer<T, S>): this
    on<S>(source: IObservable<S> | ((events: Events) => IObservable<S>), reduce: Reducer<T, S>) {
        if (!isObservable(source))
            source = source(this._events!)

        if (process.env.NODE_ENV !== 'production') {
            if (allSources(source).find(s => s == this))
                throw new CircularSubscriptionError(this, source);
        }

        source.subscribe(this)
        this._sources.add(source)
        this._reducers.set(source, reduce)
        this._sourcesLastChecked = Math.max(this._sourcesLastChecked, source.lastUpdated) // Avoid firing reduction because of new source

        return this
    }

    override getSources() { return this._sources }

    sourceUpdated<S>(source: IObservable<S>, value: S) {
        if (source.lastUpdated > this.lastUpdated) {
            let reduce = this._reducers.get(source)
            if (reduce) {
                let previousValue = this._value
                let nextValue!: T
                let logging = startLogging('🧪 (reduction)', this.displayName, emptyArray, () => ({
                    Path: this.path,
                    Trigger: source.path,
                    Previous: previousValue,
                    Current: nextValue
                }))

                try {
                    let tracker = collectAccessedSources(this) // Required for detecting circular references in reducers
                    try {
                        nextValue = reduce(this._value, value)
                    } finally {
                        tracker[dispose]()
                    }

                    this.setValue(nextValue)
                } finally {
                    logging[dispose]()
                }
            }
        }
    }

    override get value() {
        startSourceAccessed(this) // Notifying tracker before checking for updates so circular reference is detected early

        try {
            if (this._sourcesLastChecked < currentIteration) {
                let newerSource = Array.from(this._sources).find(s => s.lastUpdated > this._sourcesLastChecked)
                if (newerSource)
                    this.sourceUpdated(newerSource, (newerSource as Observable<any>).value)
            }
        } finally {
            endSourceAccessed(this)
        }

        return this._value // Not using super.value to avoid duplicate tracker notification
    }

    override setValue(value: T) {
        this._sourcesLastChecked = currentIteration
        super.setValue(value)
    }

    override skipUpdate(nextValue: T) { return this._isEqual(this._value, nextValue) }

    detach() {
        for (let source of this._sources)
            source.unsubscribe(this)
    }

    override[dispose]() {
        this.detach()
        super[dispose]()
    }
}

export class CircularSubscriptionError extends Error {
    constructor(
        public reduction: IReduction<unknown, unknown>,
        public source: IObservable<unknown>
    ) {
        super(`Cannot subscribe to '${source.displayName}', as it depends on this reduction, '${reduction.displayName}'.`);
    }
}
