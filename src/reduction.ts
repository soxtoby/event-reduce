import { IObservable, ISubscription, Observable } from "./observable";
import { Subject } from "./subject";

export function reduce<TValue>(initial: TValue): IReduction<TValue>;
export function reduce<TValue, TEvents>(initial: TValue, events: TEvents): IBoundReduction<TValue, TEvents>;
export function reduce<TValue, TEvents>(initial: TValue, events: TEvents = {} as TEvents): IReduction<TValue> {
    return events ? new BoundReduction(initial, events) : new Reduction(initial);
}

export let accessed: { reductions: Reduction<any>[] } = { reductions: [] };

export interface IReduction<TValue> extends IObservable<TValue> {
    on<TEvent>(observable: IObservable<TEvent>, reduce: (current: TValue, event: TEvent) => TValue): this;
    readonly value: TValue;
}

export class Reduction<TValue> extends Observable<TValue> implements IReduction<TValue> {
    protected _subject = new Subject<TValue>();
    protected _subscriptions = [] as [IObservable<any>, ISubscription][];
    protected _current: TValue;

    constructor(public initial: TValue) {
        super(o => this._subject.subscribe(o.next));
        this._current = initial;
    }

    on<TEvent>(observable: IObservable<TEvent>, reduce: (current: TValue, event: TEvent) => TValue): this {
        this._subscriptions.push([
            observable,
            observable.subscribe(value => {
                accessed.reductions.length = 0;
                this._current = reduce(this._current, value);
                if (accessed.reductions.some(r => r._subscriptions.some(s => s[0] == observable)))
                    throw new Error("Accessed a reduced value derived from the same event being fired.");
                accessed.reductions.length = 0;
                this._subject.next(this._current);
            })
        ]);
        return this;
    }

    get value() {
        accessed.reductions.push(this);
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