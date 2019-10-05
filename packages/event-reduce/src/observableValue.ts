import { IObservable, Observable } from "./observable";
import { Subject } from "./subject";

let valueAccessed = new Subject<ObservableValue<any>>(() => "(accessed observable values)");

export const lastAccessed = {} as { observableValue: ObservableValue<any> | undefined };

valueAccessed.subscribe(accessedValue => lastAccessed.observableValue = accessedValue, () => '(last accessed)');

export interface IObservableValue<T> extends IObservable<T> {
    readonly value: T;
}

export class ObservableValue<T> extends Observable<T> {
    constructor(
        getDisplayName: () => string,
        protected _value: T
    ) {
        super(getDisplayName);
    }

    container?: any;

    get value() {
        valueAccessed.next(this);
        return this._value;
    }

    setValue(value: T) {
        this._value = value;
        this.notifyObservers(value);
    }
}

export function collectAccessedValues(action: () => void) {
    let observables = new Set<ObservableValue<any>>();
    let unsubscribe = valueAccessed.subscribe(o => observables.add(o), () => '(accessed value collection)');

    action();

    unsubscribe();
    return observables;
}