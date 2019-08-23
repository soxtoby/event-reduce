import { ObjectOmit } from "./types";

export type Observe<T> = (nextValue: T) => void;
export type Unsubscribe = () => void;

export class Observable<T> {
    protected _observers = new Set<Observe<T>>();

    constructor(
        private _displayName: string,
        protected _value: T
    ) { }

    get displayName() { return this._displayName; }
    set displayName(name: string) { this._displayName = name; }

    get sources() { return [] as readonly Observable<any>[]; }

    subscribe(observe: Observe<T>): Unsubscribe {
        this._observers.add(observe);
        return () => this.unsubscribe(observe);
    }

    protected unsubscribe(observer: Observe<T>) {
        this._observers.delete(observer);
    }

    protected _nextValue(value: T) {
        this._value = value;
        this._observers.forEach(o => o(value));
    }

    get value() {
        observableAccessed.next(this);
        return this._value;
    }

    filter(condition: (value: T) => boolean) {
        return new ObservableOperation<T>(`${this.displayName}.filter(${nameOf(condition)})`, this._value, [this],
            observe => this.subscribe(value => condition(value) && observe(value)));
    }

    scope<TObject extends object, Scope extends Partial<TObject>>(this: Observable<TObject>, scope: Scope) {
        return new ScopedObservable<TObject, Scope>(this, scope);
    }

    map<U>(select: (value: T) => U) {
        return new ObservableOperation<U>(`${this.displayName}.map(${nameOf(select)})`, undefined!, [this],
            observe => this.subscribe(value => observe(select(value))));
    }

    asObservable() {
        return new ObservableOperation<T>(`${this.displayName}.observable`, this._value, [this], observe => this.subscribe(observe));
    }
}

function nameOf(fn: any) {
    return fn.name || fn.displayName || String(fn);
}

export class ObservableOperation<T> extends Observable<T> {
    private _unsubscribe?: Unsubscribe;

    constructor(
        public displayName: string,
        public value: T,
        private _sources: readonly Observable<any>[],
        private readonly _subscribeToSources: (observer: Observe<T>) => Unsubscribe
    ) {
        super(displayName, value);
    }

    get sources() { return this._sources; }

    subscribe(observer: Observe<T>): Unsubscribe {
        if (!this._observers.size)
            this._subscribeToSources(this._nextValue.bind(this));
        return super.subscribe(observer);
    }

    protected unsubscribe(observer: Observe<T>) {
        super.unsubscribe(observer);
        if (!this._observers.size && this._unsubscribe)
            this._unsubscribe();
    }
}

class ScopedObservable<T extends object, Scope extends Partial<T>> extends ObservableOperation<T> {
    constructor(source: Observable<T>, scope: Scope) {
        super(
            `${source.displayName}.scoped({ ${Object.entries(scope).map(([k, v]) => `${k}: ${v}`).join(', ')} })`,
            undefined!,
            [source],
            observe => this.subscribe(value =>
                Object.entries(scope)
                    .every(([k, v]) => value[k as keyof T] === v)
                && observe(value)));
    }
}

export interface IEvent {
    displayName: string;
}

interface ISubject<TIn, TOut = TIn> extends Observable<TOut> {
    next(value: TIn): void;
}

export class Subject<T> extends Observable<T> implements ISubject<T> {
    next(value: T) {
        this._nextValue(value);
    }
}

interface AsyncItem<Result, Context> {
    promise: PromiseLike<Result>;
    context: Context;
}

interface AsyncResult<Result, Context> {
    result: Result;
    context: Context;
}

interface AsyncError<Context> {
    error: any;
    context: Context;
}

class Event<T> extends Subject<T> {
    scope<TObject extends object, Scope extends Partial<TObject>>(this: ISubject<TObject>, scope: Scope) {
        let scopedEvent = new ScopedEvent<TObject, Scope>(this, scope);
        return makeEvent(scopedEvent.next.bind(scopedEvent), scopedEvent);
    }
}

class ScopedEvent<T extends object, Scope extends Partial<T>> extends ScopedObservable<T, Scope> {
    constructor(
        private _source: ISubject<T>,
        private _scope: Scope
    ) {
        super(_source, _scope);
    }

    next(partial: ObjectOmit<T, Scope>) {
        this._source.next({ ...partial, ...this._scope } as any as T);
    }

    scope<TObject extends object, SubScope extends Partial<TObject>>(this: ISubject<TObject>, scope: SubScope) {
        let scopedEvent = new ScopedEvent<TObject, SubScope>(this, scope);
        return makeEvent(scopedEvent.next.bind(scopedEvent), scopedEvent);
    }
}

class AsyncEvent<Result = void, Context = void> implements IEvent {
    private _displayName!: string;
    private _started = new Subject<AsyncItem<Result, Context>>('', undefined!);
    private _resolved = new Subject<AsyncResult<Result, Context>>('', undefined!);
    private _rejected = new Subject<AsyncError<Context>>('', undefined!);

    constructor(displayName: string) {
        this.displayName = displayName;
    }

    get displayName() { return this._displayName; }

    set displayName(name: string) {
        this._displayName = name;
        this._started.displayName = `${name}.started`;
        this._resolved.displayName = `${name}.resolved`;
        this._rejected.displayName = `${name}.rejected`;
    }

    next(promise: PromiseLike<Result>, context: Context) {
        promise.then(
            result => this._resolved.next({ result, context }),
            error => this._rejected.next({ error, context }));
        this._started.next({ promise, context });
    }

    get started() { return this._started as Observable<AsyncItem<Result, Context>>; }
    get resolved() { return this._resolved as Observable<AsyncResult<Result, Context>>; }
    get rejected() { return this._rejected as Observable<AsyncError<Context>>; }
}

function event<T = void>() {
    let subject = new Event<T>('(anonymous event)', undefined!);
    return makeEvent(subject.next.bind(subject), subject);
}

function asyncEvent<Result = void, Context = void>() {
    let asyncEvent = new AsyncEvent<Result, Context>('(anonymous async event)');
    return makeEvent(asyncEvent.next.bind(asyncEvent), asyncEvent);
}

export function makeEvent<Fn extends (...args: any[]) => void, Event extends IEvent>(fn: Fn, prototype: Event) {
    Object.setPrototypeOf(fn, prototype);
    fn.apply = Function.prototype.apply;
    return fn as Fn & Event;
}

class Reduction<T> extends Observable<T> {
    private _sources = new Map<Observable<any>, Unsubscribe>();

    on<E>(observable: Observable<E>, reduce: (previous: T, eventValue: E) => T) {
        let unsubscribeExisting = this._sources.get(observable);
        if (unsubscribeExisting)
            unsubscribeExisting();

        this._sources.set(observable, observable.subscribe(eventValue => {
            let value!: T;
            let sources = collectAccessedObservables(() => value = reduce(this.value, eventValue));

            let accessedSources = allSources(sources);
            let triggeringSources = allSources([observable]);
            let commonSource = firstIntersection(accessedSources, triggeringSources);
            if (commonSource)
                throw new Error("Accessed a reduced value derived from the same event being fired.")

            this._nextValue(value);
        }));

        return this;
    }
}

class Derivation<T> extends Observable<T> {
    private _requiresUpdate = true;
    private _sources = new Map<Observable<any>, Unsubscribe>();

    constructor(
        public displayName: string,
        private _deriveValue: () => T
    ) {
        super(displayName, undefined!);
    }

    get sources() { return Array.from(this._sources.keys()); }

    get value() {
        if (this._requiresUpdate)
            this.update();
        return super.value;
    }

    private update() {
        let value!: T;

        collectAccessedObservables(() => value = this._deriveValue())
            .forEach(o => this._sources.set(o, o.subscribe(() => this.invalidate())));

        this._requiresUpdate = false;
        this._nextValue(value);
    }

    private invalidate() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
        this._requiresUpdate = true;

        if (this._observers.size)
            this.update();
    }
}

class Watcher {
    private _sources = new Map<Observable<any>, Unsubscribe>();

    constructor(
        public displayName: string,
        private _action: () => {}
    ) {
        this.run();
    }

    run() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();

        collectAccessedObservables(this._action)
            .forEach(o => this._sources.set(o, o.subscribe(() => this.run())));
    }
}

function collectAccessedObservables(action: () => void) {
    let observables = new Set<Observable<any>>();
    let unsubscribe = observableAccessed.subscribe(o => observables.add(o));

    action();

    unsubscribe();
    return observables;
}

function allSources(sources: Iterable<Observable<any>>) {
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

function firstIntersection<T>(a: Set<T>, b: Set<T>) {
    for (let item of a)
        if (b.has(item))
            return item;
}

let observableAccessed = new Subject<Observable<any>>("(accessed observables)", undefined!);