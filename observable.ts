export type Unsubscribe = () => void;

export interface IObservable<T> {
    subscribe(next: (value: T) => void): Unsubscribe;
    filter(condition: (value: T) => boolean): IObservable<T>;
    map<U>(select: (value: T) => U): IObservable<U>;
    resolved<P>(this: IObservable<Promise<P>>): IObservable<P>;
    rejected(this: IObservable<Promise<any>>): IObservable<any>;
}

export interface IObserver<T> {
    next(value: T): void;
}

export class Observable<T> implements IObservable<T> {
    constructor(private _subscribe: (observer: IObserver<T>) => Unsubscribe) { }

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
}

export class Subject<T> extends Observable<T> implements IObserver<T> {
    private _observers = [] as IObserver<T>[];

    constructor() {
        super(observer => {
            this._observers.push(observer);
            return () => this._observers = this._observers.filter(o => o != observer);
        });
    }

    next(value: T) { this._observers.forEach(o => o.next(value)); }

    asObservable() { return new Observable<T>(observer => this.subscribe(v => observer.next(v))); }
}