import { log, sourceTree } from "./logging";
import { IObservable, Observe } from "./observable";
import { collectAccessedValues, ObservableValue, withInnerTrackingScope } from "./observableValue";
import { Unsubscribe } from "./types";

export function derive<T>(getDerivedValue: () => T, name?: string) {
    return new Derivation(() => name || '(anonymous derivation)', getDerivedValue);
}

export class Derivation<T> extends ObservableValue<T> {
    private _requiresUpdate = true;
    private _sources = new Map<IObservable<any>, Unsubscribe>();

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

    private update() {
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

    override setValue(value: T) {
        this._requiresUpdate = false;
        super.setValue(value);
    }

    private invalidate() {
        this.unsubscribeFromSources();
        this._requiresUpdate = true;

        if (this._observers.size)
            this.update();
    }

    override subscribe(observe: Observe<T>, getObserverName?: () => string) {
        if (this._requiresUpdate)
            withInnerTrackingScope(() => this.update());

        return super.subscribe(observe, getObserverName);
    }

    override unsubscribeFromSources() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}