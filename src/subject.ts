import { IObserver, ISubscriptionObserver, Observable } from "./observable";

export class Subject<T> extends Observable<T> implements IObserver<T> {
    private _observers = [] as ISubscriptionObserver<T>[];

    constructor() {
        super(observer => {
            this._observers.push(observer);

            return {
                unsubscribe: () => this._observers = this._observers.filter(o => o != observer)
            }
        });
    }

    next(value: T) { this._observers.forEach(o => o.next(value)); }
    complete() { this._observers.forEach(o => o.complete()); }
    error(error: any) { this._observers.forEach(o => o.error(error)); }
}
