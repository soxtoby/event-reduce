import { Derivation } from "./derivation";
import { IObservable, Observable } from "./observable";
import { updateChildren } from "./ownership";
import { toJSON, JSON } from "./state";
import { beginTransition } from "./tracking";
import { dispose, isObject } from "./utils";

export interface ISignal<T> extends IObservable<T> {
    readonly value: T
    setValue(newValue: T): void
}

export function signal<T>(initialValue: T, displayName?: string): ISignal<T> {
    return new Signal(displayName ?? "(anonymous value)", initialValue)
}

export class Signal<T> extends Observable<T> implements IObservable<T> {
    private _json: Derivation<JSON<T>>

    constructor(
        displayName: string,
        initialValue: T,
    ) {
        super(displayName);
        this._json = new Derivation(`toJSON(${this.displayName})`, () => toJSON(this.value))
        this._json.suppressLogging = true
        updateChildren(this, undefined, initialValue)
        this._value = initialValue // Avoid triggering a transition in constructor
    }

    toJSON() { return this._json.value }

    override get value() { return super.value }

    override setValue(value: T) {
        let transition = beginTransition(this, isObject(value) ? value : { value })
        try {
            super.setValue(value)
        } finally {
            transition[dispose]()
        }
    }

    override skipUpdate(nextValue: T) { return false }
}
