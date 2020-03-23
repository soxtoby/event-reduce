import { log, sourceTree } from "./logging";
import { IObservable, Observable } from "./observable";
import { collectAccessedValues } from "./observableValue";
import { Action } from "./types";
import { Unsubscribe } from ".";

export function watch(action: Action, name = '(anonymous watcher)'): IWatcher {
    return new Watcher(() => name, action);
}

export interface IWatcher extends IObservable<void> {
    run(): void;
}

class Watcher extends Observable<void> {
    private _sources = new Map<Observable<any>, Unsubscribe>();

    constructor(
        public getDisplayName: () => string,
        private _action: Action
    ) {
        super(getDisplayName);
        this.run();
    }

    get sources() { return Array.from(this._sources.keys()); }

    run() {
        this.unsubscribeFromSources();
        collectAccessedValues(() => this._action())
            .forEach(o => this._sources.set(o, o.subscribe(() => this.onDependenciesChanged(), () => this.displayName)));
    }

    private onDependenciesChanged() {
        if (this._observers.size)
            log('👀 (watcher)', this.displayName, [], () => ({ Sources: sourceTree(this.sources) }), () => this.notifyObservers());
    }

    unsubscribeFromSources() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}
