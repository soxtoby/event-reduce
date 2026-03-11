import { derive, IDerivation } from "./derivation";
import { SourceBase } from "./signals";
import { getState, State } from "./state";

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

    override setValue(value: T) { super.setValue(value, true); }

    override skipUpdate(nextValue: T) { return this._isEqual(this._value, nextValue); }
}
