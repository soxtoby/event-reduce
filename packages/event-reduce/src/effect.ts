import type { IObservable, IObserver } from "./observable"
import { collectAccessedSources, currentIteration } from "./tracking"
import { dispose } from "./utils"

export class Effect<T> implements IObserver<any> {
    private _attached = false
    private readonly _sources = new Set<IObservable<any>>()
    invalidatingSource?: IObservable<any>
    lastRun = -2 // Stale from the start

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
        if (source.lastUpdated > this.lastRun) {
            this.invalidatingSource = source
            this._onSourceUpdatedSinceLastRun(source)
        }
    }

    get isStale() { return this.sourceLastUpdated > this.lastRun }

    get sourceLastUpdated() { return Math.max(-1, ...[...this._sources].map(s => s.lastUpdated)) }

    /** 
     * Forces the effect to run.
     * @param effect Optional function to use to run the effect. If not provided, the original effect function will be used.
     **/
    run(effect?: () => T) {
        this.lastRun = currentIteration
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
