import { Observable, Unsubscribe } from "./observable";
import { collectAccessedValues } from "./observableValue";

export function watch(action: () => void, name = '(anonymous watcher)') {
    let watcher = new Watcher(name, action);
    return () => watcher.unsubscribe();
}

class Watcher {
    private _sources = new Map<Observable<any>, Unsubscribe>();

    constructor(
        public displayName: string,
        private _action: () => void
    ) {
        this.run();
    }

    run() {
        this.unsubscribe();
        collectAccessedValues(this._action)
            .forEach(o => this._sources.set(o, o.subscribe(() => this.run(), () => this.displayName)));
    }

    unsubscribe() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}
