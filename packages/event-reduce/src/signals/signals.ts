import { dispose } from "../utils"
import { updateOwnedValues } from "./tracking"

export class SourceTracker {
    private readonly _previous: SourceTracker | null
    readonly accessed = new Set<ISource<any>>()

    constructor(private readonly _observer: IObserver<any>) {
        this._previous = globalTracker
        globalTracker = this
    }

    sourceAccessed(source: ISource<any>) {
        let circularDependency = this.findCircularDependency(source)
        if (circularDependency)
            throw new CircularDependencyError([...circularDependency, source])

        this.accessed.add(source)
    }

    private findCircularDependency(source: ISource<any>): ISource<any>[] | null {
        if (this._observer == source as any as IObserver<any>)
            return [source]
        let circularDependency = this._previous?.findCircularDependency(source)
        return circularDependency
            ? [...circularDependency, this._observer as any as ISource<any>]
            : null
    }

    [dispose]() {
        globalTracker = this._previous
    }
}

export let globalTracker: SourceTracker | null = null
export let globalVersion = 0
export let reactingTo: ISource<any> | null = null

export function startReactingTo(source: ISource<any>) {
    let previouslyReactingTo = reactingTo
    reactingTo = source
    return { [dispose]() { reactingTo = previouslyReactingTo } }
}

export interface ISource<T> {
    displayName: string
    readonly lastUpdated: number
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

    constructor(
        public displayName: string,
        private _skipUpdate = Object.is
    ) { }

    protected get value() {
        globalTracker?.sourceAccessed(this)
        return this._value
    }

    protected setValue(newValue: T, newVersion = false) { // TODO better name for newVersion - creates new global version
        if (newVersion && reactingTo)
            throw new SideEffectDuringReactionError(reactingTo, this)

        if (!this._skipUpdate(this._value, newValue)) {
            let previousValue = this._value
            this._value = newValue
            updateOwnedValues(this, previousValue, newValue)
            this.lastUpdated = newVersion ? ++globalVersion : globalVersion

            if (newVersion)
                reactingTo = this

            try {
                for (let observer of this._observers)
                    observer.sourceUpdated(this, this._value)
            } finally {
                if (newVersion)
                    reactingTo = null
            }
        }
    }

    subscribe(observer: IObserver<T>) { this._observers.add(observer) }
    unsubscribe(observer: IObserver<T>) { this._observers.delete(observer) }
}

// NOCOMMIT not sure I have a use for this (maybe replacement for Subject?)
class Atom<T> extends SourceBase<T> {
    constructor(
        displayName: string,
        initialValue: T,
        _isEqual = Object.is
    ) {
        super(displayName, _isEqual)
        this.setValue(initialValue)
    }

    override get value() { return super.value }
    override setValue(value: T) { super.setValue(value, true) }
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

class CircularDependencyError extends Error {
    constructor(path: ISource<any>[]) { super(`Circular dependency detected: ${path.map(s => s.displayName).join(' -> ')}`) }
}

class SideEffectDuringReactionError extends Error {
    constructor(
        public reactingTo: ISource<any>,
        public causing: ISource<any>
    ) { super(`Side effect during reaction to ${reactingTo.displayName} in ${causing.displayName}`) }
}