import type { IEventFunction } from "./events"
import { isEventsClass } from "./models"
import { currentIteration, getPath, iterationSource, trackSourceAccessed, updateChildren } from "./tracking"
import { MergedSources } from "./types"
import { dispose, emptyArray, identity, nameOfCallback, nameOfFunction } from "./utils"

export interface ISource<T> extends Disposable {
    readonly displayName: string
    setDisplayName(name: string): void
    readonly path: string
    getSources(): Iterable<ISource<any>>
    readonly lastUpdated: number
    subscribe(observer: IObserver<T>): void
    unsubscribe(observer: IObserver<T>): void

    map<Out>(transform: (value: T) => Out, displayName?: string): ISource<Out>
    filter<Out extends T>(predicate: (value: T) => value is Out, displayName?: string): ISource<Out>
    filter(predicate: (value: T) => boolean, displayName?: string): ISource<T>
    filterMap<Out>(transform: (value: T) => Out | undefined, displayName?: string): ISource<Out>
}

// NOCOMMIT move elsewhere?
export interface IObserver<T> {
    readonly displayName: string
    sourceUpdated<S extends T>(source: ISource<S>, value: S): void
}

export function isSource(value: any): value is ISource<any> {
    return value instanceof Source
}

export abstract class Source<T> implements ISource<T> {
    protected readonly _observers = new Set<IObserver<T>>()
    protected _value!: T
    lastUpdated = -1

    constructor(public displayName: string) { }

    setDisplayName(name: string) { this.displayName = name }

    get path(): string { return getPath(this) }

    getSources() { return emptyArray as Iterable<ISource<any>> }

    get value() {
        trackSourceAccessed(this)[dispose]()
        return this._value
    }

    setValue(newValue: T) {
        if (process.env.NODE_ENV !== 'production') {
            if (isEventsClass(newValue) || newValue instanceof Source && !newValue.isValidAsState)
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

    map<S extends Source<any>, Out>(this: S, transform: (value: T) => Out, displayName = `${this.displayName}.map(${nameOfCallback(transform)})`): ISource<Out> {
        return bind(displayName, this, transform)
    }

    filter<S extends Source<any>>(this: S, predicate: (value: T) => boolean, displayName = `${this.displayName}.filter(${nameOfCallback(predicate)})`): ISource<T> {
        return bind(displayName, this, identity, predicate)
    }

    filterMap<S extends Source<any>, Out>(this: S, transform: (value: T) => Out | undefined, displayName = `${this.displayName}.filterMap(${nameOfCallback(transform)})`): ISource<Out> {
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

export function bind<In, Out>(displayName: string, source: ISource<In>, transform: (value: In) => Out, predicate?: (value: Out) => boolean) {
    return new BoundSource(displayName, [source], transform, predicate)
}

export function merge<Sources extends ISource<any>[]>(...sources: Sources): MergedSources<Sources>
export function merge<Sources extends ISource<any>[]>(displayName: string, ...sources: Sources): MergedSources<Sources>
export function merge<Sources extends ISource<any>[]>(...sources: [string, ...ISource<any>[]] | ISource<any>[]): MergedSources<Sources> {
    let displayName: string;
    if (typeof sources[0] == 'string') {
        displayName = sources[0] as string
        sources = sources.slice(1) as ISource<any>[]
    } else {
        displayName = `merge(${(sources as ISource<any>[]).map(s => s.displayName).join(', ')})`
    }
    return new BoundSource(displayName, sources as ISource<any>[], identity)
}

export class BoundSource<In, Out> extends Source<Out> {
    constructor(
        displayName: string,
        protected _sources: ISource<In>[],
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

    sourceUpdated(source: ISource<In>, value: In): void {
        try {
            this.setValue(this._transform(value))
        } finally {
            this._value = undefined! // Bound sources shouldn't hold on to their values
        }
    }

    protected override updateChildren(previousValue: Out, nextValue: Out) { } // Value won't be held onto

    protected override skipUpdate(value: Out) { return this._predicate?.(value) == false }
}

export function* allSources(source: ISource<any>): Generator<ISource<any>> {
    yield source
    for (let dependency of source.getSources())
        yield* allSources(dependency)
}

export class NotASourceValueError extends Error {
    constructor(
        public value: unknown
    ) {
        super("Couldn't detect source for value. Make sure you pass in an observable value directly.");
    }
}

export class InvalidStateError extends Error {
    constructor(
        public source: ISource<any>,
        public value: IEventFunction<unknown, unknown[]> | object
    ) { super(`Tried to store ${isSource(value) ? value.displayName : value} in ${source.displayName}. ${nameOfFunction(value.constructor)}s cannot be state.`); }
}

export class StateChangeOutsideTransitionError extends Error {
    constructor(
        public source: ISource<any>
    ) {
        super(`Tried to change state of ${source.displayName} outside of a transition. `
            + 'This usually means a bug in event-reduce, or in a custom source implementation.');
    }
}