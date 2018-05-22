import "./symbol";

// Based on https://github.com/tc39/proposal-observable
export interface IObservable<T> {
    subscribe(observer: IObserver<T>): ISubscription;
    subscribe(next: (value: T) => void, error?: (error: any) => void, complete?: () => void): ISubscription;
    subscribe(nextOrObserver: IObserver<T> | ((value: T) => void), error?: (error: any) => void, complete?: () => void): ISubscription;
    [Symbol.observable](): IObservable<T>;
}

export interface ISimpleObservable<T> extends IObservable<T> {
    filter(condition: (value: T) => boolean): ISimpleObservable<T>;
    map<U>(select: (value: T) => U): ISimpleObservable<U>;
    resolved<P>(this: ISimpleObservable<Promise<P>>): ISimpleObservable<P>;
    rejected(this: ISimpleObservable<Promise<any>>): ISimpleObservable<any>;
    asObservable(): ISimpleObservable<T>;
    merge<O>(this: ISimpleObservable<IObservable<O>>): ISimpleObservable<O>;
    errored(this: ISimpleObservable<IObservable<any>>): ISimpleObservable<any>;
    completed(this: ISimpleObservable<IObservable<any>>): ISimpleObservable<void>;
}

export interface ISubscription {
    unsubscribe(): void;
    readonly closed: boolean;
}

export type Unsubscribe = () => void;

export interface IObserver<T> {
    next?(value: T): void;
    error?(err: any): void;
    complete?(): void;
}

export class SubscriptionObserver<T> implements IObserver<T> {
    private _closed = false;

    constructor(private _observer: IObserver<T>) { }

    next(value: T) {
        if (!this._closed)
            this._observer.next && this._observer.next(value);
    }

    error(error: any) {
        this._observer.error && this._observer.error(error);
        this._closed = true;
    };

    complete() {
        this._observer.complete && this._observer.complete();
        this._closed = true;
    };

    get closed() {
        return this._closed;
    }
}

export function isObserver<T>(value?: any): value is IObserver<T> {
    return !!value
        && ("next" in value
            || "error" in value
            || "complete" in value
            || "closed" in value);
}

export type SubscriberFunction<T> = (observer: SubscriptionObserver<T>) => ISubscription;

class SimpleObservable<T> implements ISimpleObservable<T> {
    constructor(private _subscribe: SubscriberFunction<T>) { }

    [Symbol.observable](): IObservable<T> { return this };

    subscribe(observer: IObserver<T>): ISubscription;
    subscribe(next: (value: T) => void, error?: (error: any) => void, complete?: () => void): ISubscription;
    subscribe(nextOrObserver: IObserver<T> | ((value: T) => void), error?: (error: any) => void, complete?: () => void): ISubscription {
        let observer = isObserver(nextOrObserver)
            ? new SubscriptionObserver(nextOrObserver)
            : new SubscriptionObserver({ next: nextOrObserver, error, complete });
        return this._subscribe(observer);
    }

    filter(condition: (value: T) => boolean) {
        return new Observable<T>(observer => this.subscribe(value => condition(value) && observer.next(value)));
    }

    map<U>(select: (value: T) => U) {
        return new Observable<U>(observer => this.subscribe(value => observer.next(select(value))));
    }

    resolved<P>(this: ISimpleObservable<Promise<P>>) {
        return new Observable<P>(observer => this.subscribe(value => value.then(result => observer.next(result))));
    }

    rejected(this: ISimpleObservable<Promise<any>>) {
        return new Observable<any>(observer => this.subscribe(value => value.catch(error => observer.next(error))));
    }

    asObservable() {
        return new Observable<T>(observer => this.subscribe(v => observer.next(v)));
    }

    merge<O>(this: ISimpleObservable<IObservable<O>>) {
        return new Observable<O>(observer => {
            let subs = [] as ISubscription[];
            subs.push(this.subscribe(value => subs.push(value.subscribe(observer))));
            return {
                unsubscribe: () => subs.forEach(s => s.unsubscribe),
                get closed() { return subs.every(s => s.closed) }
            }
        });
    }

    errored(this: ISimpleObservable<IObservable<any>>) {
        return new Observable<any>(observer =>
            this.subscribe(value => value.subscribe(
                () => { },
                error => observer.next(error)
            ))
        );
    }

    completed(this: ISimpleObservable<IObservable<any>>) {
        return new Observable<void>(observer =>
            this.subscribe(value => value.subscribe(
                () => { },
                () => { },
                () => observer.next(void 0)
            ))
        );
    }
}

export let Observable: { new <T>(subscribe: (observer: SubscriptionObserver<T>) => ISubscription): ISimpleObservable<T> } = SimpleObservable;

export function useObservableType(observableImplementation: typeof Observable) {
    Observable = observableImplementation;
    Object.getOwnPropertyNames(SimpleObservable.prototype).forEach(prop => {
        if (!(prop in Observable.prototype))
            Observable.prototype[prop] = SimpleObservable.prototype[prop as keyof ISimpleObservable<any>];
    });
}

export function resetObservableType() {
    Observable = SimpleObservable;
}
