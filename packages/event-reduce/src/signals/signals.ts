import { dispose } from "../utils"
import { Owner, updateOwnedValues, withOwner } from "./tracking"

class SourceTracker {
    private readonly _previous: SourceTracker | null
    readonly accessed = new Set<Source<any>>()

    constructor(private readonly _observer: Observer<any>) {
        this._previous = globalTracker
        globalTracker = this
    }

    sourceAccessed(source: Source<any>) {
        let circularDependency = this.findCircularDependency(source)
        if (circularDependency)
            throw new CircularDependencyError([...circularDependency, source])

        this.accessed.add(source)
    }

    private findCircularDependency(source: Source<any>): Source<any>[] | null {
        if (this._observer == source as any as Observer<any>)
            return [source]
        let circularDependency = this._previous?.findCircularDependency(source)
        return circularDependency
            ? [...circularDependency, this._observer as any as Source<any>]
            : null
    }

    [dispose]() {
        globalTracker = this._previous
    }
}

let globalTracker: SourceTracker | null = null
let globalVersion = 0
let reactingTo: Source<any> | null = null

export interface Source<T> {
    displayName: string
    readonly lastUpdated: number
    subscribe(observer: Observer<T>): void
    unsubscribe(observer: Observer<T>): void
}

export interface Observer<T> {
    displayName: string
    readonly sources: ReadonlySet<Source<any>>
    sourceUpdated<S extends T>(source: Source<S>, value: S): void
}

export abstract class SourceBase<T> implements Source<T> {
    protected readonly _observers = new Set<Observer<T>>()
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

    subscribe(observer: Observer<T>) { this._observers.add(observer) }
    unsubscribe(observer: Observer<T>) { this._observers.delete(observer) }
}

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

export abstract class SourceObserverBase<Out, In = any> extends SourceBase<Out> implements Observer<In> {
    abstract readonly sources: ReadonlySet<Source<any>>

    override subscribe(observer: Observer<Out>): void {
        if (!this._observers.size)
            this.attach()

        super.subscribe(observer)
    }

    override unsubscribe(observer: Observer<Out>): void {
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

    abstract sourceUpdated<S extends In>(source: Source<S>, value: S): void
}

class Effect<T> implements Observer<any> {
    readonly sources = new Set<Source<any>>()
    sourceLastUpdated = -1
    lastRun = -1

    constructor(
        public readonly displayName: string,
        private _effect: () => T,
        private _onSourceUpdatedSinceLastRun: () => void,
        private _owner?: Owner
    ) { }

    attach() {
        for (let source of this.sources)
            source.subscribe(this)
    }

    detach() {
        for (let source of this.sources)
            source.unsubscribe(this)
    }

    sourceUpdated<S>(source: Source<S>, value: S): void {
        if (source.lastUpdated > this.lastRun) {
            this.sourceLastUpdated = source.lastUpdated
            this._onSourceUpdatedSinceLastRun()
        }
    }

    run() {
        this.lastRun = globalVersion

        let result: T;
        let tracker = new SourceTracker(this)
        let ownerScope = this._owner ? withOwner(this._owner) : null

        try {
            result = this._effect()
        } finally {
            ownerScope?.[dispose]()
            tracker[dispose]()
        }

        for (let oldSource of this.sources.difference(tracker.accessed)) {
            this.sources.delete(oldSource)
            oldSource.unsubscribe(this)
        }

        for (let newSource of tracker.accessed.difference(this.sources)) {
            this.sources.add(newSource)
            newSource.subscribe(this)
        }

        return result;
    }
}

class Reaction extends Effect<void> {
    constructor(
        displayName: string,
        reaction: () => void,
        private _schedule?: (run: () => void) => void
    ) {
        super(displayName, reaction, () => {
            let wasReactingTo = reactingTo
            if (this._schedule) {
                this._schedule(() => {
                    reactingTo = wasReactingTo
                    try {
                        this.run()
                    } finally {
                        reactingTo = null
                    }
                })
            } else {
                this.run()
            }
        })
    }
}

class Derivation<T> extends SourceObserverBase<T, any> {
    private _derive: Effect<T>

    constructor(
        displayName: string,
        derive: () => T,
        skipUpdate = Object.is
    ) {
        super(displayName, skipUpdate)
        this._derive = new Effect(displayName, derive, () => {
            if (this._observers.size)
                this.update()
        }, this)
    }

    get sources() { return this._derive.sources }
    protected override attach() { this._derive.attach() }
    protected override detach() { this._derive.detach() }

    sourceUpdated<S>(source: Source<S>, value: S) { this._derive.sourceUpdated(source, value) }

    override get value() {
        globalTracker?.sourceAccessed(this)

        if (this._derive.sourceLastUpdated > this._derive.lastRun)
            this.update()

        return this._value
    }

    private update() {
        this.setValue(this._derive.run())
    }
}

class CircularDependencyError extends Error {
    constructor(path: Source<any>[]) { super(`Circular dependency detected: ${path.map(s => s.displayName).join(' -> ')}`) }
}

class SideEffectDuringReactionError extends Error {
    constructor(
        public reactingTo: Source<any>,
        public causing: Source<any>
    ) { super(`Side effect during reaction to ${reactingTo.displayName} in ${causing.displayName}`) }
}