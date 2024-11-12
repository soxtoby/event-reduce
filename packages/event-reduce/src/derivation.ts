import { EventFn, IEventClass, isEvent } from "./events";
import { log, sourceTree } from "./logging";
import { isEventsClass } from "./models";
import { IObservable } from "./observable";
import { IObservableValue, ObservableValue, collectAccessedValues, startTrackingScope } from "./observableValue";
import { Unsubscribe } from "./types";
import { constant, emptyArray, unsubscribeAll, using } from "./utils";

let currentlyRunningDerivation = null as IObservableValue<unknown> | null;

const anonymousDerivationName = constant("(anonymous derivation)");

export function derive<T>(getDerivedValue: () => T, name?: string, valuesEqual?: (previous: T, next: T) => boolean) {
    return new Derivation(name ? constant(name) : anonymousDerivationName, getDerivedValue, valuesEqual);
}

export class Derivation<T> extends ObservableValue<T> implements IObservableValue<T> {
    protected _state: DerivationState = 'invalid';
    private _sources = [] as ObservableValue<unknown>[];
    private _sourceSubscriptions = [] as Unsubscribe[];
    protected _invalidatingSource?: IObservable<unknown>;
    private _sourceVersion = 0;

    constructor(
        getDisplayName: () => string,
        private _deriveValue: () => T,
        valuesEqual?: (previous: T, next: T) => boolean
    ) {
        super(getDisplayName, undefined!, valuesEqual);
    }

    override get sources() { return this._sources; }

    override get version() {
        this.reconcile();
        return super.version;
    }

    override get value() {
        this.reconcile();
        return super.value;
    }

    private reconcile() {
        if (this._state != 'settled') {
            if (this._state == 'invalid' || this.sources.some(this.isNewerVersion.bind(this)))
                this.update();
            this.onSettled();
        }
    }

    private isNewerVersion(source: ObservableValue<any>) {
        return source.version > this._sourceVersion;
    }

    override setValue(value: T) {
        this.onSettled();
        super.setValue(value);
    }

    private onSettled() {
        this._state = 'settled';
        delete this._invalidatingSource;
    }

    get invalidatedBy() { return this._invalidatingSource?.displayName; }

    /** 
     * Forces the value to be re-calculated. 
     * @param deriveValue Optional function to use to derive the value. If not provided, the original derivation function will be used.
     * @param reason Optional reason for the update. If not invalidated by a source change, this will be used as the reason for the update.
     **/
    update(deriveValue?: () => T, reason?: string) {
        using(startTrackingScope(), () => {
            let trigger = this._invalidatingSource;
            let triggerRef = trigger && new WeakRef(trigger);
            let previousValue = this._value;
            let value!: T;

            this._state = 'invalid'; // Ensures that sources unsettled during update don't trigger further updates

            log(this.getUpdateMessage(), this.displayName, emptyArray, () => ({
                Previous: this.loggedValue(previousValue),
                Current: this.loggedValue(value),
                Container: this.container,
                Sources: sourceTree(this.sources),
                TriggeredBy: trigger
                    ? { name: trigger.displayName, get observable() { return triggerRef!.deref() ?? "No longer in memory"; } }
                    : reason
            }), () => {
                let newSources = collectAccessedValues(() => {
                    let previouslyRunningDerivation = currentlyRunningDerivation;
                    currentlyRunningDerivation = this;
                    try {
                        value = (deriveValue ?? this._deriveValue)();
                    } finally {
                        currentlyRunningDerivation = previouslyRunningDerivation;
                    }
                });

                if (process.env.NODE_ENV !== 'production') {
                    if (isEvent(value) || isEventsClass(value))
                        throw new DerivedEventsError(this, value);
                }

                this._sources.length = 0;
                for (let source of newSources)
                    this._sources.push(source);
                this._sourceVersion = Math.max(0, ...this.sources.map(s => s.version));
                this.clearSourceInfo();
                this.onSourcesUpdated();

                this.setValue(value);
            });
        });
    }

    protected onSourcesUpdated() {
        this.unsubscribeFromSources();
        this._sourceSubscriptions = this.subscribeToSources();
    }

    protected subscribeToSources() {
        let subscriptions = [] as Unsubscribe[];

        for (let source of this._sources) {
            subscriptions.push(
                source.subscribe(this.onSourceValueChanged.bind(this, source), this.displayNameGetter),
                source.unsettled.subscribe(this.onSourceUnsettled.bind(this), this.displayNameGetter)
            );
        }

        return subscriptions;
    }

    protected onSourceUnsettled() {
        if (this._state == 'settled') {
            this._state = 'indeterminate';
            // Not logging this because it'd be too noisy,
            // and it's more of an implementation detail than a change in the model
            this.notifyObserversUnsettled();
        }
    }

    protected onSourceValueChanged(source: IObservableValue<any>) {
        this._invalidatingSource = source;

        if (this.isObserved)
            this.reconcile();
        else
            log(this.getInvalidatedMessage(), this.displayName, emptyArray, () => ({
                Previous: this.loggedValue(this._value),
                Container: this.container,
                Sources: sourceTree(this.sources)
            }));
    }

    protected getInvalidatedMessage() { return '🔗🚩 (derivation invalidated)'; }

    protected getUpdateMessage() { return '🔗 (derivation)'; }

    protected loggedValue(value: T): unknown { return value; }

    override unsubscribeFromSources() {
        unsubscribeAll(this._sourceSubscriptions);
        this._sourceSubscriptions.length = 0;
    }
}

type DerivationState = 'invalid' | 'indeterminate' | 'settled';

export function ensureNotInsideDerivation(sideEffect: string) {
    if (currentlyRunningDerivation)
        throw new SideEffectInDerivationError(currentlyRunningDerivation, sideEffect);
}

export class SideEffectInDerivationError extends Error {
    constructor(
        public derivation: IObservableValue<unknown>,
        public sideEffect: string
    ) { super(`Derivation ${derivation.displayName} triggered side effect ${sideEffect}. Derivations cannot have side effects.`); }
}

export class DerivedEventsError extends Error {
    constructor(
        public derivation: IObservableValue<unknown>,
        public value: EventFn<IEventClass> | object
    ) { super(`Derivation ${derivation.displayName} returned event or events class ${isEvent(value) ? value.displayName : value}. Events cannot be state.`); }
}