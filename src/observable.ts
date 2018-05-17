export type ObservableConstructor<T> = new (subscribe: (observer: IObserver<T>) => Unsubscribe) => IObservable<T>;

// Based on https://github.com/tc39/proposal-observable
export interface ObservableSpec<T> {
    subscribe(next: (value: T) => void): Subscription;
}

export interface IObservable<T> extends ObservableSpec<T> {
    filter(condition: (value: T) => boolean): IObservable<T>;
    map<U>(select: (value: T) => U): IObservable<U>;
    resolved<P>(this: IObservable<Promise<P>>): IObservable<P>;
    rejected(this: IObservable<Promise<any>>): IObservable<any>;
    asObservable(): IObservable<T>;
    subscribeInner<P>(this: IObservable<ObservableSpec<P>>): IObservable<P>;
}

export interface Subscription {
    unsubscribe(): void;
    closed: boolean;
}

export type Unsubscribe = () => void;

export interface IObserver<T> {
    next(value: T): void;
}

class SimpleObservable<T> implements IObservable<T> {
    constructor(private _subscribe: (observer: IObserver<T>) => Subscription) { }

    subscribe(next: (value: T) => void) {
        return this._subscribe({ next });
    }

    filter(condition: (value: T) => boolean) {
        return new Observable<T>(observer => this.subscribe(value => condition(value) && observer.next(value)));
    }

    map<U>(select: (value: T) => U) {
        return new Observable<U>(observer => this.subscribe(value => observer.next(select(value))));
    }

    resolved<P>(this: IObservable<Promise<P>>) {
        return new Observable<P>(observer => this.subscribe(value => value.then(result => observer.next(result))));
    }

    rejected(this: IObservable<Promise<any>>) {
        return new Observable<any>(observer => this.subscribe(value => value.catch(error => observer.next(error))));
    }

    asObservable() {
        return new Observable<T>(observer => this.subscribe(v => observer.next(v)));
    }

    subscribeInner<P>(this: IObservable<ObservableSpec<P>>) {
        return new Observable<P>(observer => {
            let subscriptions = [] as Subscription[];
            this.subscribe(value => subscriptions.push(value.subscribe(v => observer.next(v))));
            return {
                unsubscribe: () => subscriptions.forEach(u => u.unsubscribe()),
                closed: subscriptions.every(u => u.closed)
            }
        });
    }
}

export let Observable: { new <T>(subscribe: (observer: IObserver<T>) => Subscription): IObservable<T> } = SimpleObservable;

export function useObservableType(observableImplementation: typeof Observable) {
    Observable = observableImplementation;
    Object.getOwnPropertyNames(SimpleObservable.prototype).forEach(prop => {
        if (!(prop in Observable.prototype))
            Observable.prototype[prop] = SimpleObservable.prototype[prop as keyof IObservable<any>];
    });
}

export function resetObservableType() {
    Observable = SimpleObservable;
}