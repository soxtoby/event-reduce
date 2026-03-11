import { dispose, nameOfCallback } from "../utils"
import { derive } from "./derivation"
import { beginTransition, currentIteration, getPath, sourceWasAccessed, updateChildren } from "./tracking"

/** 
 * NOCOMMIT
 * - extend
 * - Some way to create top-level reductions - maybe a case for a "createModel" that marks a plain object as a model and adds a dispose
 */


export function isSource(value: any): value is ISource<any> {
    return value instanceof SourceBase
}

export interface ISource<T> extends Disposable {
    displayName: string
    readonly path: string
    readonly lastUpdated: number
    map<Out>(transform: (value: T) => Out, displayName?: string): ISource<Out>
    filter<Out extends T>(predicate: (value: T) => value is Out, displayName?: string): ISource<Out>
    filterMap<Out>(transform: (value: T) => Out | undefined, displayName?: string): ISource<Out>
    subscribe(observer: IObserver<T>): void
    unsubscribe(observer: IObserver<T>): void
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
        sourceWasAccessed(this)
        return this._value
    }

    protected setValue(newValue: T, isTriggerEvent = false) {
        if (!this.skipUpdate(newValue)) {
            let transition = isTriggerEvent ? beginTransition(this) : undefined
            try {
                this.lastUpdated = currentIteration
                this.updateChildren(this._value, newValue)
                this._value = newValue

                for (let observer of this._observers)
                    observer.sourceUpdated(this, this._value)
            } finally {
                transition?.[dispose]()
            }
        }
    }

    protected skipUpdate(nextValue: T) { return Object.is(this._value, nextValue) }

    protected updateChildren(previousValue: T, nextValue: T) { updateChildren(this, previousValue, nextValue) }


    // NOCOMMIT these shouldn't return IDerivation types for events
    map<Out>(transform: (value: T) => Out, displayName = `${this.displayName}.map(${nameOfCallback(transform)})`) {
        return derive(() => transform(this.value), `${displayName}.map(${nameOfCallback(transform)})`)
    }

    filter<Out extends T>(predicate: (value: T) => value is Out, displayName = `${this.displayName}.filter(${nameOfCallback(predicate)})`) {
        return derive(() => this.value as Out, (_, next) => !predicate(next), `${displayName}.filter(${nameOfCallback(predicate)})`)
    }

    filterMap<Out>(transform: (value: T) => Out | undefined, displayName = `${this.displayName}.filterMap(${nameOfCallback(transform)})`) {
        return derive(() => transform(this.value) as Out, (_, next) => next == undefined, `${displayName}.filterMap(${nameOfCallback(transform)})`)
    }

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