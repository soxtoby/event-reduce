import { dispose } from "../utils";
import { derive, IDerivation } from "./derivation";
import { SourceBase } from "./signals";
import { getState, State } from "./state";
import { beginTransition } from "./tracking";

export class Atom<T> extends SourceBase<T> {
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
