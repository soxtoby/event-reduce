import { IObservable, Observable } from "./observable";
import { constant } from "./utils";

export interface ISubject<T> extends IObservable<T> {
    next(value: T): void;
}

const anonymousSubjectName = constant("(anonymous subject)");

export class Subject<T> extends Observable<T> implements ISubject<T> {
    constructor(getDisplayName: () => string = anonymousSubjectName) { super(getDisplayName); }
    next(value: T) { this.notifyObservers(value); }
}
