import { Unsubscribe } from "./types";
import { filteredName, NamedBase, nameOfCallback } from "./utils";

export type Observe<T> = (value: T) => void;

export interface IObservable<T> {
    subscribe(observe: Observe<T>, getObserverName?: () => string): Unsubscribe;
    dispose(): void;
    filter(condition: (value: T) => boolean, getDisplayName?: () => string): IObservable<T>;
    map<U>(select: (value: T) => U, getDisplayName?: () => string): IObservable<U>;

    displayName: string;
    readonly sources: readonly IObservable<any>[];
}

export interface IObserver<T> {
    getDisplayName(): string;
    next: Observe<T>;
}

export function merge<T>(observables: IObservable<T>[]): IObservable<T> {
    let getDisplayName = () => `merged(${observables.map(o => o.displayName).join(', ')})`;
    return new ObservableOperation<T>(getDisplayName, observables,
        observer => {
            let unsubscribes = observables.map(o => o.subscribe(value => observer.next(value), getDisplayName));
            return () => unsubscribes.forEach(u => u());
        });
}

export class Observable<T> extends NamedBase {
    protected _observers = new Set<IObserver<T>>();

    get sources() { return [] as readonly IObservable<any>[]; }

    subscribe(observe: Observe<T>, getObserverName = () => '(anonymous observer)'): Unsubscribe {
        let observer = { getDisplayName: getObserverName, next: observe };
        this._observers.add(observer);
        return () => this.unsubscribe(observer);
    }

    protected unsubscribe(observer: IObserver<T>) {
        this._observers.delete(observer);
    }

    dispose() {
        this.unsubscribeFromSources();
        this._observers.clear();
    }

    protected notifyObservers(value: T) {
        Array.from(this._observers).forEach(o => o.next(value));
    }

    unsubscribeFromSources() { }

    filter(condition: (value: T) => boolean, getDisplayName: () => string = () => filteredName(this.displayName, condition)): IObservable<T> {
        return new ObservableOperation<T>(getDisplayName, [this],
            observer => this.subscribe(value => condition(value) && observer.next(value), getDisplayName));
    }

    map<U>(select: (value: T) => U, getDisplayName: () => string = () => `${this.displayName}.map(${nameOfCallback(select)})`): IObservable<U> {
        return new ObservableOperation<U>(getDisplayName, [this],
            observer => this.subscribe(value => observer.next(select(value)), getDisplayName));
    }
}

export class ObservableOperation<T> extends Observable<T> {
    private _unsubscribeFromSources?: Unsubscribe;

    constructor(
        getDisplayName: () => string,
        private _sources: readonly IObservable<any>[],
        private readonly _subscribeToSources: (observer: IObserver<T>) => Unsubscribe
    ) {
        super(getDisplayName);
    }

    override get sources() { return this._sources; }

    override subscribe(observer: Observe<T>, getObserverName = () => '(anonymous observer)'): Unsubscribe {
        let unsubscribe = super.subscribe(observer, getObserverName);
        if (this._observers.size == 1)
            this._unsubscribeFromSources = this._subscribeToSources({ getDisplayName: () => this.displayName, next: this.notifyObservers.bind(this) });
        return unsubscribe;
    }

    protected override unsubscribe(observer: IObserver<T>) {
        super.unsubscribe(observer);
        if (!this._observers.size)
            this.unsubscribeFromSources();
    }

    override unsubscribeFromSources() {
        if (this._unsubscribeFromSources)
            this._unsubscribeFromSources();
    }
}

export function allSources(sources: Iterable<IObservable<any>>) {
    let allSources = new Set<IObservable<any>>();
    addSourcesRecursive(sources);
    return allSources;

    function addSourcesRecursive(sources: Iterable<IObservable<any>>) {
        for (let s of sources) {
            allSources.add(s);
            addSourcesRecursive(s.sources);
        }
    }
}

export function pathToSource(leaves: Iterable<IObservable<any>>, root: IObservable<any>): IObservable<any>[] | undefined {
    for (let l of leaves) {
        if (l == root)
            return [l];
        let path = pathToSource(l.sources, root);
        if (path)
            return path.concat([l]);
    }
}

export function isObservable<T>(maybeObservable: any): maybeObservable is IObservable<T> {
    return maybeObservable && typeof maybeObservable.subscribe == 'function';
}