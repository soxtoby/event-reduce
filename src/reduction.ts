import { IObservable, Observable } from "./observable";
import { Subject } from "./subject";
import { values } from "mobx";

export function reduce<TValue>(initial: TValue): Reduction<TValue>;
export function reduce<TValue, TEvents>(initial: TValue, events: TEvents): BoundReduction<TValue, TEvents>;
export function reduce<TValue, TEvents>(initial: TValue, events: TEvents = {} as TEvents): Reduction<TValue> {
    return events ? new BoundReduction(initial, events) : new Reduction(initial);
}

export let lastReduction: Reduction<any> | undefined;
let insideReducer = false;

export interface IReduction<TValue> extends IObservable<TValue> {
    on<TEvent>(observable: IObservable<TEvent>, reduce: (current: TValue, event: TEvent) => TValue): this;
    readonly value: TValue;
}

export class Reduction<TValue> extends Observable<TValue> implements IReduction<TValue> {
    protected _subject = new Subject<TValue>();
    protected _current: TValue;

    constructor(public initial: TValue) {
        super(o => this._subject.subscribe(o.next));
        this._current = initial;
    }

    on<TEvent>(observable: IObservable<TEvent>, reduce: (current: TValue, event: TEvent) => TValue): this {
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

export interface IBoundReduction<TValue, TEvents> extends IReduction<TValue> {
    on<TEvent>(event: ((events: TEvents) => IObservable<TEvent>) | IObservable<TEvent>, reduce: (current: TValue, event: TEvent) => TValue): this;
}

export class BoundReduction<TValue, TEvents> extends Reduction<TValue> implements IBoundReduction<TValue, TEvents> {
    constructor(public initial: TValue, private _events: TEvents = {} as TEvents) { super(initial); }

    on<TEvent>(observable: ((events: TEvents) => IObservable<TEvent>) | IObservable<TEvent>, reduce: (current: TValue, event: TEvent) => TValue): this {
        return super.on(isObservable(observable) ? observable : observable(this._events), reduce);
    }
}

function isObservable(o: any): o is IObservable<any> {
    return !!o.subscribe;
}