import { dispose } from "../utils"
import { IObserver, ISource } from "./signals"
import { currentIteration, trackAccessedSources } from "./tracking"

export class Effect<T> implements IObserver<any> {
    readonly sources = new Set<ISource<any>>()
    sourceLastUpdated = -1
    lastRun = -1

    constructor(
        public readonly displayName: string,
        private _effect: () => T,
        private _onSourceUpdatedSinceLastRun: () => void
    ) { }

    attach() {
        for (let source of this.sources)
            source.subscribe(this)
    }

    detach() {
        for (let source of this.sources)
            source.unsubscribe(this)
    }

    sourceUpdated<S>(source: ISource<S>, value: S): void {
        if (source.lastUpdated > this.lastRun) {
            this.sourceLastUpdated = source.lastUpdated
            this._onSourceUpdatedSinceLastRun()
        }
    }

    /** 
     * Forces the effect to run.
     * @param effect Optional function to use to run the effect. If not provided, the original effect function will be used.
     **/
    run(effect?: () => T) {
        this.lastRun = currentIteration

        let result: T;
        let tracker = trackAccessedSources(this)

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
            newSource.subscribe(this)
        }

        return result;
    }

    [dispose]() {
        this.detach()
        this.sources.clear()
    }
}