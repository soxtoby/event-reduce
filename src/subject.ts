import { IObserver, Observable } from "./observable";

export class Subject<T> extends Observable<T> implements IObserver<T> {
    private _observers = [] as IObserver<T>[];

    constructor() {
        super(observer => {
            this._observers.push(observer);
            return {
                unsubscribe: () => this._observers = this._observers.filter(o => o != observer),
                closed: false
            }
        });
    }

    next(value: T) { this._observers.forEach(o => o.next && o.next(value)); }
}