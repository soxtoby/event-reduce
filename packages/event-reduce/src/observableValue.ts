import { changeOwnedValue } from "./cleanup";
import { allSources, IObservable, Observable, pathToSource } from "./observable";
import { Subject } from "./subject";
import { Action, Unsubscribe } from "./types";
import { constant, dispose, firstIntersection } from "./utils";

let valueAccessed: Subject<ValueAccess>;
let lastValueConsumed: Subject<void>;
let lastAccess: ValueAccess | undefined;
let triggeringSources = new Set<IObservable<any>>;
let triggeringObservable: IObservable<any> | undefined;
let latestVersion = 0; // Shared latest version, so no need to track version per source
const accessedObservableValuesName = constant("(accessed observable values)");
const consumedLastObservableValueName = constant("(consumed last observable value)");
const lastAccessedName = constant("(last accessed)");

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
        if (process.env.NODE_ENV !== 'production') {
            let commonSource = triggeringSources.size
                ? firstIntersection(triggeringSources, allSources([this]))
                : undefined;

            valueAccessed.next(commonSource
                ? new AccessedValueWithCommonSourceError(commonSource, triggeringObservable!, this)
                : this);
        } else {
            valueAccessed.next(this);
        }

        return this._value;
    }

    setValue(value: T) {
        if (!this._valuesEqual(this._value, value)) {
            changeOwnedValue(this, this._value, value);
            this._value = value;
            this._version = ++latestVersion;
            this.notifyObserversUnsettled();
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
    return new Set(collectValueAccesses(action).map(accessedObservable));
}

export function protectAgainstAccessingValueWithCommonSource(currentSource: IObservable<any>, action: Action) {
    if (process.env.NODE_ENV !== 'production') {
        let outerTriggeringObservable = triggeringObservable;
        let outerTriggeringSources = triggeringSources;
        triggeringObservable = currentSource;
        triggeringSources = new Set(
            Array.from(outerTriggeringSources)
                .concat(Array.from(allSources([currentSource]))));

        try {
            let accesses = collectValueAccesses(action);
            let invalidAccessError = accesses.find(isAccessError);
            if (invalidAccessError)
                throw invalidAccessError;
        } finally {
            triggeringObservable = outerTriggeringObservable;
            triggeringSources = outerTriggeringSources;
        }
    } else {
        action();
    }
}

const accessedValueCollectionName = constant("(accessed value collection)");

function collectValueAccesses(action: Action) {
    let accesses = [] as ValueAccess[];
    let unsubscribeFromAccessed = valueAccessed.subscribe(accesses.push.bind(accesses), accessedValueCollectionName);
    let unsubscribeFromConsumed = lastValueConsumed.subscribe(accesses.pop.bind(accesses));

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

    valueAccessed = new Subject<ValueAccess>(accessedObservableValuesName);
    lastValueConsumed = new Subject<void>(consumedLastObservableValueName);
    let unsubscribeLastAccessed = valueAccessed.subscribe(setLastAccess, lastAccessedName);

    return function stopTrackingScope() {
        unsubscribeLastAccessed();
        lastValueConsumed = outerLastValueConsumed;
        valueAccessed = outerValueAccessed;
    }
}

function setLastAccess(access: ValueAccess) {
    lastAccess = access;
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
    if (lastAccessed && withInnerTrackingScope(() => lastAccessed.value) == value)
        return lastAccessed;
}

export function consumeLastAccessed() {
    if (lastAccess) {
        let consumed = lastAccess;
        lastValueConsumed.next();
        lastAccess = undefined;
        return accessedObservable(consumed);
    }
}

type ValueAccess = ObservableValue<any> | IAccessedObservablueError;
interface IAccessedObservablueError extends Error { readonly accessedObservable: ObservableValue<any> };

function isAccessError(value: ValueAccess): value is IAccessedObservablueError {
    return (value as IAccessedObservablueError).accessedObservable != undefined;
}

function accessedObservable(value: ValueAccess): ObservableValue<any> {
    return (value as IAccessedObservablueError).accessedObservable ?? value;
}

export class ValueIsNotObservableError extends Error {
    constructor(
        public value: unknown
    ) {
        super("Couldn't detect observable value. Make sure you pass in an observable value directly.");
    }
}

export class AccessedValueWithCommonSourceError extends Error implements IAccessedObservablueError {
    constructor(
        public commonSource: IObservable<unknown>,
        public triggeringObservable: IObservable<unknown>,
        public accessedObservable: ObservableValue<any>
    ) {
        super(`Accessed an observable value derived from the same event being fired.
Fired:    ${pathToSource([triggeringObservable], commonSource)!.map(o => o.displayName).join(' -> ')}
Accessed: ${pathToSource([accessedObservable], commonSource)!.map(o => o.displayName).join(' -> ')}`);
    }
}