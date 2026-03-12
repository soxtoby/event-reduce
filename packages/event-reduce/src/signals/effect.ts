import { dispose } from "../utils"
import type { IObserver, ISource } from "./signals"
import { currentIteration, collectAccessedSources } from "./tracking"

export class Effect<T> implements IObserver<any> {
    private _attached = false
    readonly sources = new Set<ISource<any>>()
    invalidatingSource?: ISource<any>
    lastRun = -2 // Stale from the start

    constructor(
        public readonly displayName: string,
        private _effect: () => T,
        private _onSourceUpdatedSinceLastRun: (source: ISource<any>) => void
    ) { }

    attach() {
        this._attached = true
        for (let source of this.sources)
            source.subscribe(this)
    }

    detach() {
        this._attached = false
        for (let source of this.sources)
            source.unsubscribe(this)
    }

    sourceUpdated<S>(source: ISource<S>, value: S): void {
        if (source.lastUpdated > this.lastRun) {
            this.invalidatingSource = source
            this._onSourceUpdatedSinceLastRun(source)
        }
    }

    get isStale() { return this.sourceLastUpdated > this.lastRun }

    get sourceLastUpdated() { return Math.max(-1, ...[...this.sources].map(s => s.lastUpdated)) }

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

        for (let oldSource of this.sources.difference(tracker.accessed)) {
            this.sources.delete(oldSource)
            oldSource.unsubscribe(this)
        }

        for (let newSource of tracker.accessed.difference(this.sources)) {
            this.sources.add(newSource)
            if (this._attached)
                newSource.subscribe(this)
        }

        return result
    }

    [dispose]() {
        this.detach()
        this.sources.clear()
    }
}