import { derive, IDerivation } from "./derivation";
import { ISource, Source } from "./sources";
import { getState, State } from "./state";
import { beginTransition } from "./tracking";
import { dispose } from "./utils";

export class Atom<T> extends Source<T> implements ISource<T> {
    private _json: IDerivation<State<T>>

    constructor(
        displayName: string,
        initialValue: T,
        private _isEqual = Object.is
    ) {
        super(displayName);
        this._json = derive(() => getState(this.value), `toJSON(${this.displayName})`)
        this.setValue(initialValue);
    }

    toJSON() { return this._json.value; }

    override get value() { return super.value }

    override setValue(value: T) {
        let transition = beginTransition(this, true)
        try {
            super.setValue(value);
        } finally {
            transition[dispose]()
        }
    }

    override skipUpdate(nextValue: T) { return this._isEqual(this._value, nextValue); }
}