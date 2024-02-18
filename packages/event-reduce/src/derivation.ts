import { log, sourceTree } from "./logging";
import { IObservable } from "./observable";
import { IObservableValue, ObservableValue, collectAccessedValues, withInnerTrackingScope } from "./observableValue";
import { Unsubscribe } from "./types";

let currentlyRunningDerivation = null as IObservableValue<unknown> | null;

export function derive<T>(getDerivedValue: () => T, name?: string, valuesEqual?: (previous: T, next: T) => boolean) {
    return new Derivation(() => name || '(anonymous derivation)', getDerivedValue, valuesEqual);
}

export class Derivation<T> extends ObservableValue<T> implements IObservableValue<T> {
    private _requiresUpdate = true;
    private _sources = new Map<IObservable<any>, Unsubscribe>();
    private _invalidatingSource?: IObservable<unknown>;

    constructor(
        getDisplayName: () => string,
        private _deriveValue: () => T,
        valuesEqual?: (previous: T, next: T) => boolean
    ) {
        super(getDisplayName, undefined!, valuesEqual);
    }

    override get sources() { return Array.from(this._sources.keys()); }

    override get value() {
        if (this._requiresUpdate)
            this.update();
        return super.value;
    }

    override setValue(value: T, notifyObservers?: boolean) {
        this._requiresUpdate = false;
        super.setValue(value, notifyObservers);
    }

    get invalidatedBy() { return this._invalidatingSource?.displayName; }

    /** 
     * Forces the value to be re-calculated. 
     * @param deriveValue Optional function to use to derive the value. If not provided, the original derivation function will be used.
     * @param reason Optional reason for the update. If not invalidated by a source change, this will be used as the reason for the update.
     **/
    update(deriveValue?: () => T, reason?: string, notifyObservers = true) {
        withInnerTrackingScope(() => {
            this._requiresUpdate = false;
            let trigger = this._invalidatingSource;
            let triggerRef = trigger && new WeakRef(trigger);
            delete this._invalidatingSource;
            let previousValue = this._value;
            let value!: T;

            this.unsubscribeFromSources();

            log(this.getUpdateMessage(), this.displayName, [], () => ({
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
                for (let source of newSources)
                    this._sources.set(source, source.subscribe(() => this.invalidate(source), () => this.displayName));
                this.clearSourceInfo();

                this.setValue(value, notifyObservers);
            });
        });
    }

    protected getUpdateMessage() { return '🔗 (derivation)'; }

    private invalidate(source: IObservable<unknown>) {
        let oldSources = this.sources;
        this.unsubscribeFromSources();
        this._requiresUpdate = true;
        this._invalidatingSource = source;

        this.onInvalidated(oldSources);
    }

    protected onInvalidated(oldSources: readonly IObservable<any>[]) {
        if (this.isObserved) {
            this.update();
        } else {
            log('🔗🚩 (derivation invalidated)', this.displayName, [], () => ({
                Previous: this.loggedValue(this._value),
                Container: this.container,
                Sources: sourceTree(oldSources)
            }));
        }
    }

    protected loggedValue(value: T): unknown { return value; }

    override unsubscribeFromSources() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}

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