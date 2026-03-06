import { dispose, nameOfCallback } from "../utils"
import { derive, IDerivation } from "./derivation"
import { getState, State } from "./state"
import { beginTransition, currentIteration, sourceWasAccessed, updateOwnedObjects } from "./tracking"

/** 
 * TODO
 * - Logging in derivations and reductions
 * - Source "path" built by ownership (include derivations?)
 * - extend
 * - Some way to create top-level reductions
 */


export function isSource(value: any): value is ISource<any> {
    return value instanceof SourceBase
}

export interface ISource<T> {
    displayName: string
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
    private _json?: IDerivation<State<T>>
    protected readonly _observers = new Set<IObserver<T>>()
    protected _value!: T
    lastUpdated = -1

    constructor(public displayName: string) { }

    toJSON() {
        // Lazy init to avoid infinite loop in Derivation constructor
        return (this._json ??= derive(() => getState(this.value), `toJSON(${this.displayName})`)).value
    }

    get value() {
        sourceWasAccessed(this)
        return this._value
    }

    protected setValue(newValue: T, isTriggerEvent = false) {
        if (!this.skipUpdate(newValue)) {
            let transition = isTriggerEvent ? beginTransition(this) : undefined
            try {
                this.lastUpdated = currentIteration
                let previousValue = this._value
                this._value = newValue
                updateOwnedObjects(this, previousValue, newValue)

                for (let observer of this._observers)
                    observer.sourceUpdated(this, this._value)
            } finally {
                transition?.[dispose]()
            }
        }
    }

    protected skipUpdate(nextValue: T) { return Object.is(this._value, nextValue) }

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
}

// NOCOMMIT not sure I have a use for this (maybe replacement for Subject?)
class Atom<T> extends SourceBase<T> {
    constructor(
        displayName: string,
        initialValue: T,
        private _isEqual = Object.is
    ) {
        super(displayName)
        this.setValue(initialValue)
    }

    override setValue(value: T) { super.setValue(value, true) }

    override skipUpdate(nextValue: T) { return this._isEqual(this._value, nextValue) }
}

export abstract class SourceObserverBase<Out, In = any> extends SourceBase<Out> implements IObserver<In> {
    abstract readonly sources: ReadonlySet<ISource<any>>

    override subscribe(observer: IObserver<Out>): void {
        if (!this._observers.size)
            this.attach()

        super.subscribe(observer)
    }

    override unsubscribe(observer: IObserver<Out>): void {
        super.unsubscribe(observer)

        if (!this._observers.size)
            this.detach()
    }

    protected attach() {
        for (let source of this.sources)
            source.subscribe(this)
    }

    protected detach() {
        for (let source of this.sources)
            source.unsubscribe(this)
    }

    abstract sourceUpdated<S extends In>(source: ISource<S>, value: S): void
}

export class NotASourceValueError extends Error {
    constructor(
        public value: unknown
    ) {
        super("Couldn't detect source for value. Make sure you pass in an observable value directly.");
    }
}