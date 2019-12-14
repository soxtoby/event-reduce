import { nameOfFunction, filteredName, NamedBase } from "./utils";

export type Observe<T> = (value: T) => void;
export type Unsubscribe = () => void;

export interface IObservable<T> {
    subscribe(observe: Observe<T>, getObserverName?: () => string): Unsubscribe;
    unsubscribeFromSources(): void;
    filter(condition: (value: T) => boolean, getDisplayName?: () => string): IObservable<T>;
    map<U>(select: (value: T) => U): IObservable<U>;

    displayName: string;
    readonly sources: readonly IObservable<any>[];
}

export interface IObserver<T> {
    getDisplayName(): string;
    next: Observe<T>;
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

    protected notifyObservers(value: T) {
        Array.from(this._observers).forEach(o => o.next(value));
    }

    unsubscribeFromSources() { }

    filter(condition: (value: T) => boolean, getDisplayName: () => string = () => filteredName(this.displayName, condition)): IObservable<T> {
        return new ObservableOperation<T>(getDisplayName, [this],
            observer => this.subscribe(value => condition(value) && observer.next(value), getDisplayName));
    }

    map<U>(select: (value: T) => U): IObservable<U> {
        let mapName = () => `${this.displayName}.map(${nameOfFunction(select)})`;
        return new ObservableOperation<U>(mapName, [this],
            observer => this.subscribe(value => observer.next(select(value)), mapName));
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

    get sources() { return this._sources; }

    subscribe(observer: Observe<T>, getObserverName = () => '(anonymous observer)'): Unsubscribe {
        let unsubscribe = super.subscribe(observer, getObserverName);
        if (this._observers.size == 1)
            this._unsubscribeFromSources = this._subscribeToSources({ getDisplayName: () => this.displayName, next: this.notifyObservers.bind(this) });
        return unsubscribe;
    }

    protected unsubscribe(observer: IObserver<T>) {
        super.unsubscribe(observer);
        if (!this._observers.size)
            this.unsubscribeFromSources();
    }

    unsubscribeFromSources() {
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