import "./symbol";

// Based on https://github.com/tc39/proposal-observable
export interface IObservable<T> {
    subscribe(next?: (value: T) => void, error?: (error: any) => void, complete?: () => void): ISubscription;
    subscribe(observer?: IObserver<T>): ISubscription;
}

export interface ISimpleObservable<T> extends IObservable<T> {
    filter(condition: (value: T) => boolean): ISimpleObservable<T>;
    map<U>(select: (value: T) => U): ISimpleObservable<U>;
    resolved<P>(this: ISimpleObservable<PromiseLike<P>>): ISimpleObservable<P>;
    rejected(this: ISimpleObservable<PromiseLike<any>>): ISimpleObservable<any>;
    asObservable(): ISimpleObservable<T>;
    merge<O>(this: ISimpleObservable<IObservable<O>>): ISimpleObservable<O>;
    errored(this: ISimpleObservable<IObservable<any>>): ISimpleObservable<any>;
    completed(this: ISimpleObservable<IObservable<any>>): ISimpleObservable<void>;
    [Symbol.observable](): IObservable<T>; // not on IObservable as RxJS doesn't have it on their Observable implementation
}

export interface ISubscription {
    unsubscribe(): void;
}

export type Unsubscribe = () => void;

export interface IObserver<T> {
    next?(value: T): void;
    error?(err: any): void;
    complete?(): void;
}

export interface ISubscriptionObserver<T> extends IObserver<T> {
    next(value: T): void;
    error(error: any): void;
    complete(): void;
}

export function createSubscriptionObserver<T>(nextOrObserver?: IObserver<T> | ((value: T) => void), error?: (error: any) => void, complete?: () => void): ISubscriptionObserver<T> {
    let observer = isObserver(nextOrObserver)
        ? nextOrObserver
        : { next: nextOrObserver, error, complete };

    return {
        next: observer.next || (() => { }),
        error: observer.error || (() => { }),
        complete: observer.complete || (() => { })
    }
}

export function isObserver<T>(value?: any): value is IObserver<T> {
    return !!value
        && ("next" in value
            || "error" in value
            || "complete" in value
            || "closed" in value);
}

export type SubscriberFunction<T> = (observer: ISubscriptionObserver<T>) => ISubscription;

class SimpleObservable<T> implements ISimpleObservable<T> {
    constructor(private _subscribe: SubscriberFunction<T>) { }

    [Symbol.observable](): IObservable<T> { return this };

    subscribe(observer?: IObserver<T>): ISubscription;
    subscribe(next?: (value: T) => void, error?: (error: any) => void, complete?: () => void): ISubscription;
    subscribe(nextOrObserver?: IObserver<T> | ((value: T) => void), error?: (error: any) => void, complete?: () => void): ISubscription {
        return this._subscribe(createSubscriptionObserver(nextOrObserver, error, complete));
    }

    filter(condition: (value: T) => boolean) {
        return new Observable<T>(observer => this.subscribe(value => condition(value) && observer.next(value)));
    }

    map<U>(select: (value: T) => U) {
        return new Observable<U>(observer => this.subscribe(value => observer.next(select(value))));
    }

    resolved<P>(this: ISimpleObservable<PromiseLike<P>>) {
        return new Observable<P>(observer => this.subscribe(value => value.then(result => observer.next(result))));
    }

    rejected(this: ISimpleObservable<PromiseLike<any>>) {
        return new Observable<any>(observer => this.subscribe(value => value.then(null, error => observer.next(error))));
    }

    asObservable() {
        return new Observable<T>(observer => this.subscribe(v => observer.next(v)));
    }

    merge<O>(this: ISimpleObservable<IObservable<O>>) {
        return new Observable<O>(observer => {
            let subs = [] as ISubscription[];
            subs.push(this.subscribe(value => subs.push(value.subscribe(observer))));
            return mergeSubscriptions(subs);
        });
    }

    errored(this: ISimpleObservable<IObservable<any>>) {
        return new Observable<any>(observer => {
            let subs = [] as ISubscription[];
            subs.push(this.subscribe(value => subs.push(value.subscribe(
                () => { },
                error => observer.next(error)
            ))));
            return mergeSubscriptions(subs);
        });
    }

    completed(this: ISimpleObservable<IObservable<any>>) {
        return new Observable<void>(observer => {
            let subs = [] as ISubscription[];
            subs.push(this.subscribe(value => subs.push(value.subscribe(
                () => { },
                () => { },
                () => observer.next(void 0)
            ))));
            return mergeSubscriptions(subs);
        });
    }
}

export let Observable: { new <T>(subscribe: (observer: ISubscriptionObserver<T>) => ISubscription): ISimpleObservable<T> } = SimpleObservable;

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

export function mergeSubscriptions(subs: ISubscription[]) {
    return {
        unsubscribe: () => subs.forEach(s => s.unsubscribe),
    }
}
