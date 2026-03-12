import { dispose, nameOfCallback, nameOfFunction } from "../utils"
import type { IEventBase } from "./events"
import { isEventsClass } from "./nodes"
import { currentIteration, getPath, iterationSource, trackSourceAccessed, updateChildren } from "./tracking"

/** 
 * NOCOMMIT
 * - extend
 * - Some way to create top-level reductions - maybe a case for a "createModel" that marks a plain object as a model and adds a dispose
 */

export function isSource(value: any): value is ISource<any> {
    return value instanceof SourceBase
}

export type SourceValue<Source extends ISource<any>> = Source extends ISource<infer T> ? T : never

export interface ISource<T> extends Disposable {
    displayName: string
    readonly path: string
    readonly lastUpdated: number
    subscribe(observer: IObserver<T>): void
    unsubscribe(observer: IObserver<T>): void
}

export interface IValueSource<T> extends ISource<T> {
    readonly value: T
    map<Out>(transform: (value: T) => Out, displayName?: string): IValueSource<Out>
    filter<Out extends T>(predicate: (value: T) => value is Out, displayName?: string): IValueSource<Out>
    filterMap<Out>(transform: (value: T) => Out | undefined, displayName?: string): IValueSource<Out>
}

export interface IObserver<T> {
    displayName: string
    readonly sources: ReadonlySet<ISource<any>>
    sourceUpdated<S extends T>(source: ISource<S>, value: S): void
}

export abstract class SourceBase<T> implements ISource<T> {
    protected readonly _observers = new Set<IObserver<T>>()
    protected _value!: T
    lastUpdated = -1

    constructor(public displayName: string) { }

    get path(): string { return getPath(this) }

    get value() {
        trackSourceAccessed(this)[dispose]()
        return this._value
    }

    protected setValue(newValue: T) {
        if (process.env.NODE_ENV !== 'production') {
            if (isEventsClass(newValue) || newValue instanceof SourceBase && !newValue.isValidState)
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

    protected isValidState = true

    // NOCOMMIT these shouldn't return IDerivation types for events
    map<Source extends SourceBase<any>, Out>(this: Source, transform: (value: T) => Out, displayName = `${this.displayName}.map(${nameOfCallback(transform)})`) {
        return SourceBase.bind(this, v => transform(v), Object.is, displayName)
    }

    filter<Source extends SourceBase<any>, Out extends T>(this: Source, predicate: (value: T) => value is Out, displayName = `${this.displayName}.filter(${nameOfCallback(predicate)})`) {
        return SourceBase.bind(this, v => v as Out, (_, next) => !predicate(next), displayName)
    }

    filterMap<Source extends SourceBase<any>, Out>(this: Source, transform: (value: T) => Out | undefined, displayName = `${this.displayName}.filterMap(${nameOfCallback(transform)})`) {
        return SourceBase.bind(this, v => transform(v)!, (_, next) => next == undefined, displayName)
    }

    static bind: <Source extends SourceBase<any>, Out>(
        source: Source,
        transform: (value: SourceValue<Source>) => Out,
        skipUpdate: (previous: Out, next: Out) => boolean,
        displayName: string
    ) => Source extends IValueSource<any> ? IValueSource<Out> : ISource<Out>

    subscribe(observer: IObserver<T>) { this._observers.add(observer) }
    unsubscribe(observer: IObserver<T>) { this._observers.delete(observer) }

    [dispose]() {
        this.updateChildren(this._value, undefined!)
        this._value = undefined!
        this._observers.clear()
    }
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
        public value: IEventBase<unknown, unknown[]> | object
    ) { super(`Tried to store ${isSource(value) ? value.displayName : value} in ${source.displayName}. ${nameOfFunction(value.constructor)}s cannot be state.`); }
}

export class StateChangeOutsideTransitionError extends Error {
    constructor(
        public source: ISource<any>
    ) {
        super(`Tried to change state of ${source.displayName} outside of a transition. '
        + 'This usually means a bug in event-reduce, or in a custom source implementation.`);
    }
}