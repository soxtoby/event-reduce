import type { IObservable, IObserver } from "./observable"
import { collectAccessedSources, currentIteration } from "./tracking"
import { dispose } from "./utils"

export class Effect<T> implements IObserver<any> {
    private readonly _sources = new Set<IObservable<any>>()
    private _attached = false
    private _lastRun = -1 // Stale from the start
    invalidatingSource?: IObservable<any>

    constructor(
        public readonly displayName: string,
        private _effect: () => T,
        private _onSourceUpdatedSinceLastRun: (source: IObservable<any>) => void
    ) { }

    getSources() { return this._sources }

    attach() {
        if (!this._attached) {
            this._attached = true
            for (let source of this._sources)
                source.subscribe(this)
        }
    }

    detach() {
        if (this._attached) {
            this._attached = false
            for (let source of this._sources)
                source.unsubscribe(this)
        }
    }

    sourceUpdated<S>(source: IObservable<S>, value: S): void {
        if (source.lastUpdated > this._lastRun) {
            this.invalidatingSource = source
            this._onSourceUpdatedSinceLastRun(source)
        }
    }

    get isStale() {
        if (this._lastRun < 0
            || this.invalidatingSource?.lastUpdated! > this._lastRun) // Fast-track for the most common case
            return true

        for (let source of this._sources)
            if (source.lastUpdated > this._lastRun)
                return true

        return false
    }

    /** 
     * Forces the effect to run.
     * @param effect Optional function to use to run the effect. If not provided, the original effect function will be used.
     **/
    run(effect?: () => T) {
        this._lastRun = currentIteration
        delete this.invalidatingSource

        let result: T
        let tracker = collectAccessedSources(this)

        try {
            result = (effect ?? this._effect)()
        } finally {
            tracker[dispose]()
        }

        for (let oldSource of this._sources.difference(tracker.accessed)) {
            this._sources.delete(oldSource)
            oldSource.unsubscribe(this)
        }

        for (let newSource of tracker.accessed.difference(this._sources)) {
            this._sources.add(newSource)
            if (this._attached)
                newSource.subscribe(this)
        }

        return result
    }

    [dispose]() {
        this.detach()
        this._sources.clear()
    }
}
