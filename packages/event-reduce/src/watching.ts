import { log, sourceTree } from "./logging";
import { IObservable, Observable, Unsubscribe } from "./observable";
import { collectAccessedValues } from "./observableValue";

export function watch<T = void>(action: (input: T) => void, initialInput: T, name = '(anonymous watcher)'): IWatcher<T> {
    return new Watcher(() => name, action, initialInput);
}

export interface IWatcher<T> extends IObservable<void> {
    run(input: T): void;
}

class Watcher<T> extends Observable<void> {
    private _sources = new Map<Observable<any>, Unsubscribe>();

    constructor(
        public getDisplayName: () => string,
        private _action: (input: T) => void,
        initialInput: T
    ) {
        super(getDisplayName);
        this.run(initialInput);
    }

    get sources() { return Array.from(this._sources.keys()); }

    run(input: T) {
        this.unsubscribeFromSources();
        collectAccessedValues(() => this._action(input))
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
