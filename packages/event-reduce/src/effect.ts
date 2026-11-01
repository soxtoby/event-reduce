import type { IObservable, IObserver } from "./observable"
import { collectAccessedSources, currentIteration, lastChangeIteration } from "./tracking"
import { dispose } from "./utils"

export class Effect<T> implements IObserver<any> {
    private readonly _sources = new Set<IObservable<any>>()
    private _attached = false
    private _lastRun = -1 // Stale from the start
    private _lastChecked = -1 // Running or checking brings sources up to date, so they can't change again in the same iteration
    private _checkingSources = false
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
            for (let source of this._sources) {
                source.subscribe(this)
                if (source.lastChanged > this._lastRun) // Changed while detached, so this wasn't notified
                    this.invalidatingSource = source
            }
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
        if (source.lastChanged > this._lastRun) {
            this.invalidatingSource = source
            this._onSourceUpdatedSinceLastRun(source)
        }
    }

    get isStale() {
        if (this._lastRun < 0
            || this.invalidatingSource?.lastChanged! > this._lastRun) // Fast-track for the most common case
            return true

        if (lastChangeIteration <= this._lastChecked // Nothing has changed since sources were last checked
            || this._attached && lastChangeIteration < currentIteration // Attached, so notified of changes from earlier iterations
            || this._checkingSources) // Re-entered through circular sources
            return false

        this._checkingSources = true
        try {
            for (let source of this._sources) { // Not using .values().some(), since it's much slower on this hot path
                source.updateIfStale()
                if (source.lastChanged > this._lastRun) {
                    this.invalidatingSource = source
                    return true
                }
            }
        } finally {
            this._checkingSources = false
        }

        this._lastChecked = currentIteration
        return false
    }

    /** 
     * Forces the effect to run.
     * @param effect Optional function to use to run the effect. If not provided, the original effect function will be used.
     **/
    run(effect?: () => T) {
        this._lastRun = this._lastChecked = currentIteration
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
