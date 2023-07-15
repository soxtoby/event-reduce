import { IObservable, Observable } from "./observable";

export interface ISubject<T> extends IObservable<T> {
    next(value: T): void;
}

export class Subject<T> extends Observable<T> implements ISubject<T> {
    constructor(getDisplayName: () => string = () => "(anonymous subject)") { super(getDisplayName); }
    next(value: T) { this.notifyObservers(value); }
}
