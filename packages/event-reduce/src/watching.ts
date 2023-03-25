import { log, sourceTree } from "./logging";
import { IObservable, Observable } from "./observable";
import { collectAccessedValues, IObservableValue } from "./observableValue";
import { Action, Unsubscribe } from "./types";

export function watch(action: Action, name = '(anonymous watcher)'): IWatcher {
    return new Watcher(() => name, action);
}

export interface IWatcher extends IObservable<IObservableValue<unknown>> {
    run(): void;
}

class Watcher extends Observable<IObservableValue<unknown>> {
    private _sources = new Map<Observable<any>, Unsubscribe>();

    constructor(
        public getDisplayName: () => string,
        private _action: Action
    ) {
        super(getDisplayName);
        this.run();
    }

    override get sources() { return Array.from(this._sources.keys()); }

    run() {
        this.unsubscribeFromSources();
        collectAccessedValues(() => this._action())
            .forEach(o => this._sources.set(o, o.subscribe(() => this.onDependencyChanged(o), () => this.displayName)));
    }

    private onDependencyChanged(value: IObservableValue<any>) {
        if (this._observers.size)
            log('👀 (watcher)', this.displayName, [], () => ({
                Changed: value,
                Sources: sourceTree(this.sources)
            }), () => this.notifyObservers(value));
    }

    override unsubscribeFromSources() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}
