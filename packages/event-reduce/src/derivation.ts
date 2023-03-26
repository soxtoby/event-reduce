import { log, sourceTree } from "./logging";
import { IObservable } from "./observable";
import { IObservableValue, ObservableValue, collectAccessedValues, withInnerTrackingScope } from "./observableValue";
import { Subject } from "./subject";
import { Unsubscribe } from "./types";

export function derive<T>(getDerivedValue: () => T, name?: string) {
    return new Derivation(() => name || '(anonymous derivation)', getDerivedValue);
}

export interface IDerivation<T> extends IObservableValue<T> {
    invalidation: IObservable<void>;
}

export class Derivation<T> extends ObservableValue<T> implements IDerivation<T> {
    private _requiresUpdate = true;
    private _sources = new Map<IObservable<any>, Unsubscribe>();
    private _invalidation = new Subject<void>();

    constructor(
        getDisplayName: () => string,
        private _deriveValue: () => T
    ) {
        super(getDisplayName, undefined!);
    }

    override get sources() { return Array.from(this._sources.keys()); }

    override get value() {
        if (this._requiresUpdate)
            withInnerTrackingScope(() => this.update());
        return super.value;
    }

    get invalidation() { return this._invalidation; }

    private update() {
        this._requiresUpdate = false;
        let value!: T;

        collectAccessedValues(() => value = this._deriveValue())
            .forEach(o => this._sources.set(o, o.subscribe(() => this.invalidate(), () => this.displayName)));

        log('🔗 (derivation)', this.displayName, [], () => ({
            Previous: this._value,
            Current: value,
            Container: this.container,
            Sources: sourceTree(this.sources)
        }), () => this.setValue(value));
    }

    private invalidate() {
        let oldSources = this.sources;
        this.unsubscribeFromSources();
        this._requiresUpdate = true;

        if (this._invalidation.isObserved)
            log('🔗🚩 (derivation invalidated)', this.displayName, [], () => ({
                Previous: this._value,
                Container: this.container,
                Sources: sourceTree(oldSources)
            }), () => this._invalidation.next());

        if (this.isObserved)
            this.update();
    }

    override dispose() {
        this._invalidation.dispose();
        super.dispose();
    }

    override unsubscribeFromSources() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}