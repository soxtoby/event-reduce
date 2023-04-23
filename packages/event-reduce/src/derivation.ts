import { log, sourceTree } from "./logging";
import { IObservable } from "./observable";
import { IObservableValue, ObservableValue, collectAccessedValues, withInnerTrackingScope } from "./observableValue";
import { Unsubscribe } from "./types";

let currentlyRunningDerivation = null as IObservableValue<unknown> | null;

export function derive<T>(getDerivedValue: () => T, name?: string) {
    return new Derivation(() => name || '(anonymous derivation)', getDerivedValue);
}

export class Derivation<T> extends ObservableValue<T> implements IObservableValue<T> {
    private _requiresUpdate = true;
    private _sources = new Map<IObservable<any>, Unsubscribe>();
    private _invalidatingSource?: IObservable<unknown>;

    constructor(
        getDisplayName: () => string,
        private _deriveValue: () => T
    ) {
        super(getDisplayName, undefined!);
    }

    override get sources() { return Array.from(this._sources.keys()); }

    override get value() {
        if (this._requiresUpdate)
            this.update();
        return super.value;
    }

    /** 
     * Forces the value to be re-calculated. 
     * @param deriveValue Optional function to use to derive the value. If not provided, the original derivation function will be used.
     * @param reason Optional reason for the update. If not invalidated by a source change, this will be used as the reason for the update.
     **/
    update(deriveValue = this._deriveValue, reason?: string) {
        withInnerTrackingScope(() => {
            this._requiresUpdate = false;
            let trigger = this._invalidatingSource;
            delete this._invalidatingSource;
            let value!: T;

            this.unsubscribeFromSources();
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

            log('🔗 (derivation)', this.displayName, [], () => ({
                Previous: this._value,
                Current: value,
                Container: this.container,
                Sources: sourceTree(this.sources),
                TriggeredBy: trigger ?? reason
            }), () => this.setValue(value, false));
        });
    }

    private invalidate(source: IObservable<unknown>) {
        let oldSources = this.sources;
        this.unsubscribeFromSources();
        this._requiresUpdate = true;
        this._invalidatingSource = source;

        log('🔗🚩 (derivation invalidated)', this.displayName, [], () => ({
            Previous: this._value,
            Container: this.container,
            Sources: sourceTree(oldSources)
        }), () => this.notifyObservers());
    }

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