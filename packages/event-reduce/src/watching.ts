import { Observable, Unsubscribe, IObservable } from "./observable";
import { collectAccessedValues } from "./observableValue";

export function watch(action: () => void, name = '(anonymous watcher)'): IWatcher {
    return new Watcher(() => name, action);
}

export interface IWatcher extends IObservable<void> {
    run(): void;
}

class Watcher extends Observable<void> {
    private _sources = new Map<Observable<any>, Unsubscribe>();

    constructor(
        public getDisplayName: () => string,
        private _action: () => void
    ) {
        super(getDisplayName);
        this.run();
    }

    run() {
        this.unsubscribeFromSources();
        collectAccessedValues(this._action)
            .forEach(o => this._sources.set(o, o.subscribe(() => this.notifyObservers(), () => this.displayName)));
    }

    unsubscribeFromSources() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}
