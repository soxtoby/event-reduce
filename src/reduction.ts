import { IObservable, Observable } from "./observable";
import { Subject } from "./subject";

export function reduce<TValue>(initial: TValue): Reduction<TValue>;
export function reduce<TValue, TActions>(initial: TValue, actions: TActions): BoundReduction<TValue, TActions>;
export function reduce<TValue, TActions>(initial: TValue, actions: TActions = {} as TActions): Reduction<TValue> {
    return actions ? new BoundReduction(initial, actions) : new Reduction(initial);
}

export let lastReduction: Reduction<any> | undefined;
let insideReducer = false;

export class Reduction<TValue> extends Observable<TValue> {
    protected _subject = new Subject<TValue>();
    protected _current: TValue;

    constructor(public initial: TValue) {
        super(o => this._subject.subscribe(o.next));
        this._current = initial;
    }

    on<A>(observable: IObservable<A>, reduce: (current: TValue, action: A) => TValue): this {
        observable.subscribe(value => {
            insideReducer = true;
            this._current = reduce(this._current, value);
            insideReducer = false;
            this._subject.next(this._current);
        });
        return this;
    }

    get value() {
        if (insideReducer)
            throw new Error("Can't access a reduction value from inside a reducer: behaviour is undefined.");
        lastReduction = this;
        return this._current;
    }
}

export class BoundReduction<TValue, TActions> extends Reduction<TValue> {
    constructor(public initial: TValue, private _actions: TActions = {} as TActions) { super(initial); }

    on<A>(action: ((actions: TActions) => IObservable<A>) | IObservable<A>, reduce: (current: TValue, actionValue: A) => TValue): this {
        return super.on(isObservable(action) ? action : action(this._actions), reduce);
    }
}

function isObservable(o: any): o is IObservable<any> {
    return !!o.subscribe;
}