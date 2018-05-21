import "symbol-observable";

// Based on https://github.com/tc39/proposal-observable
export interface IObservable<T> {
    subscribe(observer?: IObserver<T>): ISubscription;
    subscribe(next?: (value: T) => void, error?: (error: any) => void, complete?: () => void): ISubscription;
    subscribe(nextOrObserver?: IObserver<T> | ((value: T) => void), error?: (error: any) => void, complete?: () => void): ISubscription;
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
    [Symbol.observable](): IObservable<T>; // uses symbol-observable ponyfill
}

export interface ISubscription {
    unsubscribe(): void;
    closed: boolean;
}

export type Unsubscribe = () => void;

export interface IObserver<T> {
    next?(value: T): void;
    error?(err: any): void;
    complete?(): void;
    closed?: boolean;
}

export type SubscriberFunction<T> = (observer: IObserver<T>) => ISubscription;

class SimpleObservable<T> implements ISimpleObservable<T> {
    constructor(private _subscribe: SubscriberFunction<T>) { }

    [Symbol.observable](): IObservable<T> { return this };

    subscribe(observer?: IObserver<T>): ISubscription;
    subscribe(next?: (value: T) => void, error?: (error: any) => void, complete?: () => void): ISubscription;
    subscribe(nextOrObserver?: IObserver<T> | ((value: T) => void), error?: (error: any) => void, complete?: () => void): ISubscription {
        return this.isObserver(nextOrObserver)
            ? this._subscribe({ ...nextOrObserver })
            : this._subscribe({ next: nextOrObserver, error, complete});
    }

    private isObserver<T>(value?: any): value is IObserver<T> {
        return !!value 
            && ("next" in value 
            || "error" in value 
            || "complete" in value 
            || "closed" in value);
    }

    filter(condition: (value: T) => boolean) {
        return new Observable<T>(observer => this.subscribe(value => condition(value) && observer.next && observer.next(value)));
    }

    map<U>(select: (value: T) => U) {
        return new Observable<U>(observer => this.subscribe(value => observer.next && observer.next(select(value))));
    }

    resolved<P>(this: ISimpleObservable<Promise<P>>) {
        return new Observable<P>(observer => this.subscribe(value => value.then(result => observer.next && observer.next(result))));
    }

    rejected(this: ISimpleObservable<Promise<any>>) {
        return new Observable<any>(observer => this.subscribe(value => value.catch(error => observer.next && observer.next(error))));
    }

    asObservable() {
        return new Observable<T>(observer => this.subscribe(v => observer.next && observer.next(v)));
    }

    merge<O>(this: ISimpleObservable<IObservable<O>>) {
        return new Observable<O>(observer =>
            this.subscribe(value => value.subscribe(observer))
        );
    }

    errored(this: ISimpleObservable<IObservable<any>>) {
        return new Observable<any>(observer =>
            this.subscribe(value => value.subscribe(
                () => { },
                observer.next
            ))
        );
    }

    completed(this: ISimpleObservable<IObservable<any>>) {
        return new Observable<void>(observer =>
            this.subscribe(value => value.subscribe(
                () => { },
                () => { },
                () => observer.next && observer.next(void 0)
            ))
        );
    }
}

export let Observable: { new <T>(subscribe: (observer: IObserver<T>) => ISubscription): ISimpleObservable<T> } = SimpleObservable;

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
