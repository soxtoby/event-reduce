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
let latestVersion = 0; // Shared latest version, so no need to track version per source

startTrackingScope();

export interface IObservableValue<T> extends IObservable<T> {
    readonly value: T;
}

export class ObservableValue<T> extends Observable<T> implements IObservableValue<T> {
    private readonly _unsettled = new Subject<void>(() => `${this.displayName}.unsettled`);
    private _version = 0;

    constructor(
        getDisplayName: () => string,
        protected _value: T,
        private _valuesEqual: (previous: T, next: T) => boolean = (a, b) => a === b
    ) {
        super(getDisplayName);
        changeOwnedValue(this, undefined, _value);
    }

    container?: any;

    /** Fired when a source value has changed, and this value _may_ not be up-to-date any more. */
    get unsettled() { return this._unsettled as IObservable<void>; }

    /** Increased whenever the value changes. Latest version is shared, so this won't increase by just 1. */
    get version() { return this._version; }

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

    setValue(value: T, notifyObservers = true) {
        if (!this._valuesEqual(this._value, value)) {
            changeOwnedValue(this, this._value, value);
            this._value = value;
            this._version = ++latestVersion;
            this.notifyObserversUnsettled(); // Still need to do this even if we're not notifying observers about the value changing
            if (notifyObservers)
                this.notifyObservers(value);
        }
    }

    protected notifyObserversUnsettled() { this._unsettled.next(); }

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
        return observable;
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