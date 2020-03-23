import { ensureValueOwner, unsubscribeOldModelsFromSources, valueOwner } from "./cleanup";
import { IObservable, Observable } from "./observable";
import { Subject } from "./subject";
import { Action } from "./types";

let valueAccessed: Subject<ObservableValue<any>>;
let lastValueConsumed: Subject<void>;
let lastAccessed: ObservableValue<any> | undefined;

startTrackingScope();

export interface IObservableValue<T> extends IObservable<T> {
    readonly value: T;
}

export class ObservableValue<T> extends Observable<T> {
    constructor(
        getDisplayName: () => string,
        protected _value: T
    ) {
        super(getDisplayName);
        ensureValueOwner(_value, this);
    }

    container?: any;

    get value() {
        valueAccessed.next(this);
        return this._value;
    }

    setValue(value: T) {
        if (value !== this._value) {
            if (valueOwner(this._value) == this)
                unsubscribeOldModelsFromSources(this._value, value);
            this._value = value;
            ensureValueOwner(value, this);
            this.notifyObservers(value);
        }
    }
}

export function collectAccessedValues(action: Action) {
    let observables = [] as ObservableValue<any>[];
    let unsubscribeFromAccessed = valueAccessed.subscribe(o => observables.push(o), () => '(accessed value collection)');
    let unsubscribeFromConsumed = lastValueConsumed.subscribe(() => observables.pop());

    try {
        action();
    } finally {
        unsubscribeFromAccessed();
        unsubscribeFromConsumed();
    }

    return new Set(observables);
}

export function withInnerTrackingScope<T>(action: () => T) {
    let outerValueAccessed = valueAccessed;
    let outerLastValueConsumed = lastValueConsumed;
    let unsubscribeLastAccessed = startTrackingScope();

    try {
        return action();
    } finally {
        unsubscribeLastAccessed();
        lastValueConsumed = outerLastValueConsumed;
        valueAccessed = outerValueAccessed;
    }
}

function startTrackingScope() {
    valueAccessed = new Subject<ObservableValue<any>>(() => "(accessed observable values)");
    lastValueConsumed = new Subject<void>(() => "(consumed last observable value)");
    return valueAccessed.subscribe(accessedValue => lastAccessed = accessedValue, () => '(last accessed)');
}

export function consumeLastAccessed() {
    if (lastAccessed) {
        let consumed = lastAccessed
        lastValueConsumed.next();
        lastAccessed = undefined;
        return consumed;
    }
}