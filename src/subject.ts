import { IObserver, Observable, SubscriberFunction, SubscriptionObserver } from "./observable";

export class Subject<T> extends Observable<T> implements IObserver<T> {
    private _observers = [] as SubscriptionObserver<T>[];

    constructor() {
        super(observer => {
            this._observers.push(observer);
            
            return {
                unsubscribe: () => this._observers = this._observers.filter(o => o != observer),
                get closed() { return observer.closed }
            }
        });
    }

    next(value: T) { this._observers.forEach(o => o.next(value)); }
}