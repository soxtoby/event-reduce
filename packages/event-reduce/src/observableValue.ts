import { changeOwnedValue } from "./cleanup";
import { allSources, IObservable, Observable, pathToSource } from "./observable";
import { Subject } from "./subject";
import { Action, Unsubscribe } from "./types";
import { dispose, firstIntersection } from "./utils";

interface IValueAccess {
    observable: ObservableValue<any>;
    error?: Error;
}

let valueAccessed: Subject<IValueAccess>;
let lastValueConsumed: Subject<void>;
let lastAccessed: ObservableValue<any> | undefined;
let triggeringSources = new Set<IObservable<any>>;
let triggeringObservable: IObservable<any> | undefined;

startTrackingScope();

export interface IObservableValue<T> extends IObservable<void> {
    readonly value: T;
    readonly values: IObservable<T>;
}

export class ObservableValue<T> extends Observable<void> implements IObservableValue<T> {
    constructor(
        getDisplayName: () => string,
        protected _value: T
    ) {
        super(getDisplayName);
        changeOwnedValue(this, undefined, _value);
    }

    container?: any;

    get value() {
        let commonSource = triggeringSources.size
            ? firstIntersection(triggeringSources, allSources([this]))
            : undefined;
        let error = commonSource
            ? new AccessedValueWithCommonSourceError(commonSource, triggeringObservable!, this)
            : undefined;
        valueAccessed.next({ observable: this, error });
        return this._value;
    }

    get values() { return this.map(() => this.value, () => `${this.displayName}.values`); }

    setValue(value: T, notifyObservers = true) {
        if (value !== this._value) {
            changeOwnedValue(this, this._value, value);
            this._value = value;
            if (notifyObservers)
                this.notifyObservers();
        }
    }

    override[dispose]() {
        super[dispose]();
        changeOwnedValue(this, this._value, undefined);
        // Keep the value, in case this is still being held onto (e.g. with useDerredValue)
    }
}

export function collectAccessedValues(action: Action) {
    return new Set(collectValueAccesses(action).map(a => a.observable));
}

export function protectAgainstAccessingValueWithCommonSource(currentSource: IObservable<any>, action: Action) {
    let outerTriggeringObservable = triggeringObservable;
    let outerTriggeringSources = triggeringSources;
    triggeringObservable = currentSource;
    triggeringSources = new Set(
        Array.from(outerTriggeringSources)
            .concat(Array.from(allSources([currentSource]))));

    try {
        let accesses = collectValueAccesses(action);
        let invalidAccess = accesses.find(a => a.error != null);
        if (invalidAccess)
            throw invalidAccess.error;
    } finally {
        triggeringObservable = outerTriggeringObservable;
        triggeringSources = outerTriggeringSources;
    }
}

function collectValueAccesses(action: Action) {
    let accesses = [] as IValueAccess[];
    let unsubscribeFromAccessed = valueAccessed.subscribe(a => accesses.push(a), () => '(accessed value collection)');
    let unsubscribeFromConsumed = lastValueConsumed.subscribe(() => accesses.pop());

    try {
        action();
    } finally {
        unsubscribeFromAccessed();
        unsubscribeFromConsumed();
    }

    return accesses;
}

export function withInnerTrackingScope<T>(action: () => T) {
    let endTrackingScope = startTrackingScope();

    try {
        return action();
    } finally {
        endTrackingScope();
    }
}

export function startTrackingScope(): Unsubscribe {
    let outerValueAccessed = valueAccessed;
    let outerLastValueConsumed = lastValueConsumed;

    valueAccessed = new Subject<IValueAccess>(() => "(accessed observable values)");
    lastValueConsumed = new Subject<void>(() => "(consumed last observable value)");
    let unsubscribeLastAccessed = valueAccessed.subscribe(access => lastAccessed = access.observable, () => '(last accessed)');

    return () => {
        unsubscribeLastAccessed();
        lastValueConsumed = outerLastValueConsumed;
        valueAccessed = outerValueAccessed;
    }
}

/** Allows subscribing to the changes of the specified observable value. */
export function valueChanged<T>(observableValue: T) {
    let observable = getUnderlyingObservable(observableValue);
    if (observable)
        return observable.values;
    throw new ValueIsNotObservableError(observableValue);
}

export function getUnderlyingObservable<T>(value: T): ObservableValue<T> | undefined {
    let lastAccessed = consumeLastAccessed();
    if (lastAccessed && withInnerTrackingScope(() => lastAccessed!.value) == value)
        return lastAccessed;
}

export function consumeLastAccessed() {
    if (lastAccessed) {
        let consumed = lastAccessed
        lastValueConsumed.next();
        lastAccessed = undefined;
        return consumed;
    }
}

export class ValueIsNotObservableError extends Error {
    constructor(
        public value: unknown
    ) {
        super("Couldn't detect observable value. Make sure you pass in an observable value directly.");
    }
}

export class AccessedValueWithCommonSourceError extends Error {
    constructor(
        public commonSource: IObservable<unknown>,
        public triggeringObservable: IObservable<unknown>,
        public accessedObservable: IObservable<unknown>
    ) {
        super(`Accessed an observable value derived from the same event being fired.
Fired:    ${pathToSource([triggeringObservable], commonSource)!.map(o => o.displayName).join(' -> ')}
Accessed: ${pathToSource([accessedObservable], commonSource)!.map(o => o.displayName).join(' -> ')}`);
    }
}