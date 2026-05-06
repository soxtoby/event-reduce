import type { IEventFunction } from "./events"
import { isEventsClass } from "./models"
import { getPath, updateChildren } from "./ownership"
import { currentIteration, iterationSource, trackSourceAccessed } from "./tracking"
import { MergedObservables } from "./types"
import { dispose, emptyArray, identity, nameOfCallback, nameOfFunction } from "./utils"

export interface IObservable<T> extends Disposable {
    readonly displayName: string
    setDisplayName(name: string): void
    readonly path: string
    getSources(): Iterable<IObservable<any>>
    readonly lastUpdated: number
    subscribe(observer: IObserver<T>): void
    unsubscribe(observer: IObserver<T>): void

    map<Out>(transform: (value: T) => Out, displayName?: string): IObservable<Out>
    filter<Out extends T>(predicate: (value: T) => value is Out, displayName?: string): IObservable<Out>
    filter(predicate: (value: T) => boolean, displayName?: string): IObservable<T>
    filterMap<Out>(transform: (value: T) => Out | undefined, displayName?: string): IObservable<Out>
}

export interface IObserver<T> {
    readonly displayName: string
    sourceUpdated<S extends T>(source: IObservable<S>, value: S): void
}

export function isObservable(value: any): value is IObservable<any> {
    return value instanceof Observable
}

export abstract class Observable<T> implements IObservable<T> {
    protected readonly _observers = new Set<IObserver<T>>()
    protected _value!: T
    lastUpdated = -1

    constructor(public displayName: string) { }

    setDisplayName(name: string) { this.displayName = name }

    get path(): string { return getPath(this) }

    getSources() { return emptyArray as Iterable<IObservable<any>> }

    get value() {
        trackSourceAccessed(this)[dispose]()
        return this._value
    }

    setValue(newValue: T) {
        if (process.env.NODE_ENV !== 'production') {
            if (isEventsClass(newValue) || newValue instanceof Observable && !newValue.isValidAsState)
                throw new InvalidStateError(this, newValue)

            if (!iterationSource)
                throw new StateChangeOutsideTransitionError(this)
        }

        if (!this.skipUpdate(newValue)) {
            this.lastUpdated = currentIteration
            this.updateChildren(this._value, newValue)
            this._value = newValue

            for (let observer of this._observers)
                observer.sourceUpdated(this, this._value)
        }
    }

    protected skipUpdate(nextValue: T) { return Object.is(this._value, nextValue) }

    protected updateChildren(previousValue: T, nextValue: T) { updateChildren(this, previousValue, nextValue) }

    protected isValidAsState = true

    map<S extends Observable<any>, Out>(this: S, transform: (value: T) => Out, displayName = `${this.displayName}.map(${nameOfCallback(transform)})`): IObservable<Out> {
        return bind(displayName, this, transform)
    }

    filter<S extends Observable<any>>(this: S, predicate: (value: T) => boolean, displayName = `${this.displayName}.filter(${nameOfCallback(predicate)})`): IObservable<T> {
        return bind(displayName, this, identity, predicate)
    }

    filterMap<S extends Observable<any>, Out>(this: S, transform: (value: T) => Out | undefined, displayName = `${this.displayName}.filterMap(${nameOfCallback(transform)})`): IObservable<Out> {
        return bind(displayName, this, v => transform(v)!, value => value != undefined)
    }

    subscribe(observer: IObserver<T>) { this._observers.add(observer) }
    unsubscribe(observer: IObserver<T>) { this._observers.delete(observer) }

    [dispose]() {
        this.updateChildren(this._value, undefined!)
        this._value = undefined!
        this._observers.clear()
    }
}

export function bind<In, Out>(displayName: string, observable: IObservable<In>, transform: (value: In) => Out, predicate?: (value: Out) => boolean) {
    return new BoundObservable(displayName, [observable], transform, predicate)
}

export function merge<Observables extends IObservable<any>[]>(observables: Observables): MergedObservables<Observables>
export function merge<Observables extends IObservable<any>[]>(displayName: string, observables: Observables): MergedObservables<Observables>
export function merge<Observables extends IObservable<any>[]>(displayNameOrObservables: string | Observables, maybeObservables?: Observables): MergedObservables<Observables> {
    let displayName: string;
    let observables: Observables
    if (typeof displayNameOrObservables == 'string') {
        displayName = displayNameOrObservables
        observables = maybeObservables!
    } else {
        observables = displayNameOrObservables
        displayName = `merge(${observables.map(s => s.displayName).join(', ')})`
    }
    return new BoundObservable(displayName, observables, identity)
}

export class BoundObservable<In, Out> extends Observable<Out> {
    constructor(
        displayName: string,
        protected _sources: IObservable<In>[],
        protected _transform: (value: In) => Out,
        protected _predicate?: (value: Out) => boolean
    ) { super(displayName) }

    override getSources() { return this._sources }

    override subscribe(observer: IObserver<Out>): void {
        if (!this._observers.size)
            this._sources.forEach(source => source.subscribe(this))

        super.subscribe(observer)
    }

    override unsubscribe(observer: IObserver<Out>): void {
        super.unsubscribe(observer)

        if (!this._observers.size)
            this._sources.forEach(source => source.unsubscribe(this))
    }

    sourceUpdated(source: IObservable<In>, value: In): void {
        try {
            this.setValue(this._transform(value))
        } finally {
            this._value = undefined! // Bound sources shouldn't hold on to their values
        }
    }

    protected override updateChildren(previousValue: Out, nextValue: Out) { } // Value won't be held onto

    protected override skipUpdate(value: Out) { return this._predicate?.(value) == false }
}

export function* allSources(observable: IObservable<any>): Generator<IObservable<any>> {
    yield observable
    for (let dependency of observable.getSources())
        yield* allSources(dependency)
}

export class NoUnderlyingObservableError extends Error {
    constructor(
        public value: unknown
    ) {
        super("Couldn't detect observable for value. Make sure you pass in an observable value directly.");
    }
}

export class InvalidStateError extends Error {
    constructor(
        public observable: IObservable<any>,
        public value: IEventFunction<unknown, unknown[]> | object
    ) { super(`Tried to store ${isObservable(value) ? value.displayName : value} in ${observable.displayName}. ${nameOfFunction(value.constructor)}s cannot be state.`); }
}

export class StateChangeOutsideTransitionError extends Error {
    constructor(
        public source: IObservable<any>
    ) {
        super(`Tried to change state of ${source.displayName} outside of a transition. `
            + 'This usually means a bug in event-reduce, or in a custom observable implementation.');
    }
}
