import { Observable } from "./observable";
import { Subject } from "./subject";

const valueAccessed = new Subject<ObservableValue<any>>(() => "(accessed observable values)");

export let lastAccessed = {} as { observableValue: ObservableValue<any> | undefined };

valueAccessed.subscribe(accessedValue => lastAccessed.observableValue = accessedValue, () => '(last accessed)');

export abstract class ObservableValue<T> extends Observable<T> {
    constructor(
        getDisplayName: () => string,
        protected _value: T
    ) {
        super(getDisplayName);
    }

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
    let observables = new Set<Observable<any>>();
    let unsubscribe = valueAccessed.subscribe(o => observables.add(o), () => '(accessed value collection)');

    action();

    unsubscribe();
    return observables;
}