import { IObservable, Observable } from "./observable";

export interface ISubject<TIn, TOut = TIn> extends IObservable<TOut> {
    next(value: TIn): void;
}

export class Subject<T> extends Observable<T> implements ISubject<T> {
    next(value: T) {
        this.notifyObservers(value);
    }
}
