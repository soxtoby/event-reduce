import { IObservable, Observable, Subject } from "./observable";

export let lastReduction: Reduction<any, any> | undefined;

export function reduce<TValue, TActions>(initial: TValue, actions: TActions = {} as TActions): Reduction<TValue, TActions> {
    return new Reduction(initial, actions);
}

export class Reduction<TValue, TActions> extends Observable<TValue> {
    protected _subject = new Subject<TValue>();
    protected _current: TValue;

    constructor(public initial: TValue, private _actions: TActions = {} as TActions) {
         super(o => this._subject.subscribe(o.next));
         this._current = initial;
    }
    
    on<A>(selectAction: (actions: TActions) => IObservable<A>, reduce: (current: TValue, actionValue: A) => TValue): this;
    on<A>(observable: IObservable<A>, reduce: (current: TValue, action: A) => TValue): this;
    on<A>(action: ((actions: TActions) => IObservable<A>) | IObservable<A>, reduce: (current: TValue, actionValue: A) => TValue): this {
        let observable = isObservable(action) ? action : action(this._actions);
        observable.subscribe(value => {
            this._current = reduce(this._current, value);
            this._subject.next(this._current);
        });
        return this;
    }

    get value() {
        lastReduction = this;
        return this._current;
    }
}

function isObservable(o: any): o is IObservable<any> {
    return o.subscribe;
}