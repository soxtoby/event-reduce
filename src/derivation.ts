import { ObservableValue, collectAccessedValues } from "./observableValue";
import { Observable, Unsubscribe } from "./observable";

export function derive<T>(getDerivedValue: () => T, name?: string) {
    return new Derivation(name || '(anonymous derivation)', getDerivedValue);
}

export class Derivation<T> extends ObservableValue<T> {
    private _requiresUpdate = true;
    private _sources = new Map<Observable<any>, Unsubscribe>();

    constructor(
        public displayName: string,
        private _deriveValue: () => T
    ) {
        super(displayName, undefined!);
    }

    get sources() { return Array.from(this._sources.keys()); }

    get value() {
        if (this._requiresUpdate)
            this.update();
        return super.value;
    }

    private update() {
        let value!: T;

        collectAccessedValues(() => value = this._deriveValue())
            .forEach(o => this._sources.set(o, o.subscribe(() => this.invalidate(), this.displayName)));

        this._requiresUpdate = false;
        this._value = value;
        this.notifyObservers(value);
    }

    private invalidate() {
        this.unsubscribe();
        this._requiresUpdate = true;

        if (this._observers.size)
            this.update();
    }

    unsubscribe() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}