export type Observe<T> = (value: T) => void;
export type Unsubscribe = () => void;

export interface IObserver<T> {
    displayName: string;
    next: Observe<T>;
}


export abstract class Observable<T> {
    protected _observers = new Set<IObserver<T>>();

    constructor(private _displayName: string) { }

    get displayName() { return this._displayName; }
    set displayName(name: string) { this._displayName = name; }

    get sources() { return [] as readonly Observable<any>[]; }

    subscribe(observe: Observe<T>, observerName: string = '(anonymous observer)'): Unsubscribe {
        let observer = { displayName: observerName, next: observe };
        this._observers.add(observer);
        return () => this.unsubscribe(observer);
    }

    protected unsubscribe(observer: IObserver<T>) {
        this._observers.delete(observer);
    }

    protected notifyObservers(value: T) {
        Array.from(this._observers).forEach(o => o.next(value));
    }

    filter(condition: (value: T) => boolean) {
        let filterName = `${this.displayName}.filter(${nameOf(condition)})`;
        return new ObservableOperation<T>(filterName, [this],
            observer => this.subscribe(value => condition(value) && observer.next(value), filterName));
    }

    scope<TObject extends object, Scope extends Partial<TObject>>(this: Observable<TObject>, scope: Scope) {
        return new ScopedObservable<TObject, Scope>(this, scope);
    }

    map<U>(select: (value: T) => U) {
        let mapName = `${this.displayName}.map(${nameOf(select)})`;
        return new ObservableOperation<U>(mapName, [this],
            observer => this.subscribe(value => observer.next(select(value)), mapName));
    }
}

function nameOf(fn: any) {
    return fn.name || fn.displayName || String(fn);
}

export class ObservableOperation<T> extends Observable<T> {
    private _unsubscribe?: Unsubscribe;

    constructor(
        public displayName: string,
        private _sources: readonly Observable<any>[],
        private readonly _subscribeToSources: (observer: IObserver<T>) => Unsubscribe
    ) {
        super(displayName);
    }

    get sources() { return this._sources; }

    subscribe(observer: Observe<T>, observerName = '(anonymous observer)'): Unsubscribe {
        let unsubscribe = super.subscribe(observer, observerName);
        if (this._observers.size == 1)
            this._unsubscribe = this._subscribeToSources({ displayName: this.displayName, next: this.notifyObservers.bind(this) });
        return unsubscribe;
    }

    protected unsubscribe(observer: IObserver<T>) {
        super.unsubscribe(observer);
        if (!this._observers.size && this._unsubscribe)
            this._unsubscribe();
    }
}

export class ScopedObservable<T extends object, Scope extends Partial<T>> extends ObservableOperation<T> {
    constructor(source: Observable<T>, scope: Scope) {
        super(
            `${source.displayName}.scoped({ ${Object.entries(scope).map(([k, v]) => `${k}: ${v}`).join(', ')} })`,
            [source],
            observer => source.subscribe(value =>
                Object.entries(scope)
                    .every(([k, v]) => value[k as keyof T] === v)
                && observer.next(value),
                this.displayName));
    }
}

export function allSources(sources: Iterable<Observable<any>>) {
    let allSources = new Set<Observable<any>>();
    addSourcesRecursive(sources);
    return allSources;

    function addSourcesRecursive(sources: Iterable<Observable<any>>) {
        for (let s of sources) {
            allSources.add(s);
            addSourcesRecursive(s.sources);
        }
    }
}