import { IObservable, Observable } from "./observable";

export interface ISubject<TIn, TOut = TIn> extends IObservable<TOut> {
    next(value: TIn): void;
}

export class Subject<TIn, TOut = TIn> extends Observable<TOut> implements ISubject<TIn, TOut> {
    next(value: TIn) {
        this.notifyObservers(value as any as TOut);
    }
}
