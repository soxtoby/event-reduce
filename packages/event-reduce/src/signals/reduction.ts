import { Source, SourceObserverBase } from "./signals"
import { addSourceOwner, currentOwner, removeSourceOwner, Owner } from "./tracking"

export type Reducer<Result, Source> = (current: Result, next: Source) => Result

export class OwnerlessReductionError extends Error {
    constructor(reductionName: string) { super(`Reduction '${reductionName}' created without an owner`) }
}

export class Reduction<T, Events = void> extends SourceObserverBase<T, T> {
    sources = new Set<Source<any>>()
    private _reducers = new Map<Source<any>, (current: T, next: any) => T>()
    private _owners = new Set<Owner>()
    private _attached = false

    constructor(
        displayName: string,
        isEqual = Object.is,
        private _events?: Events
    ) {
        super(displayName, isEqual)

        let owner = currentOwner()
        if (!owner)
            throw new OwnerlessReductionError(displayName)

        this[addSourceOwner](owner)
    }

    on<S>(source: Source<S>, reduce: Reducer<T, S>): this
    on<S>(getSource: (events: Events) => Source<S>, reduce: Reducer<T, S>): this
    on<S>(source: Source<S> | ((events: Events) => Source<S>), reduce: Reducer<T, S>) {
        if (!('lastUpdated' in source))
            source = source(this._events!)

        this.sources.add(source)
        this._reducers.set(source, reduce)

        if (this._attached)
            source.subscribe(this)

        return this
    }

    override get value() { return super.value }

    sourceUpdated<S>(source: Source<S>, value: S) {
        let reduce = this._reducers.get(source)
        if (reduce) {
            let newValue = reduce(this._value, value)
            this.setValue(newValue)
        }
    }

    [addSourceOwner](owner: Owner) {
        this._owners.add(owner)
        this.syncSubscriptionState()
    }

    [removeSourceOwner](owner: Owner) {
        this._owners.delete(owner)
        this.syncSubscriptionState()
    }

    protected override attach() {
        if (this._attached)
            return

        for (let source of this.sources)
            source.subscribe(this)

        this._attached = true
    }

    protected override detach() {
        if (this._owners.size || !this._attached)
            return

        for (let source of this.sources)
            source.unsubscribe(this)

        this._attached = false
    }

    private syncSubscriptionState() {
        if (this._owners.size || this._observers.size)
            this.attach()
        else
            this.detach()
    }
}