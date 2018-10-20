import { IObservable, ISimpleObservable, ISubscription, Observable } from "./observable";
import { Subject } from "./subject";
import { event, IObservableEvent } from "./events";
import { State, setState, StateObject } from "./experimental/state";

export function reduce<TValue>(initial: TValue): IReduction<TValue>;
export function reduce<TValue, TEvents>(initial: TValue, events: TEvents): IBoundReduction<TValue, TEvents>;
export function reduce<TValue, TEvents>(initial: TValue, events: TEvents = {} as TEvents): IReduction<TValue> {
    return events ? new BoundReduction(initial, events) : new Reduction(initial);
}

export let accessed: { reductions: Reduction<any>[] } = { reductions: [] };

export interface IReduction<TValue> extends ISimpleObservable<TValue> {
    on<TEvent>(observable: IObservable<TEvent>, reduce: (current: TValue, event: TEvent) => TValue): this;
    onRestore(reduce: (current: TValue, state: State<TValue>) => TValue): this;
    restore(state: State<TValue>): void;
    readonly value: TValue;
}

export class Reduction<TValue> extends Observable<TValue> implements IReduction<TValue> {
    protected _subject = new Subject<TValue>();
    protected _subscriptions = new Map<IObservable<any>, ISubscription>();
    protected _current: TValue;
    private _restore = new Subject<State<TValue>>();

    constructor(public initial: TValue) {
        super(o => this._subject.subscribe((value => o.next(value))));
        this._current = initial;
        this.onRestore((current, state) => {
            if (current && typeof current == 'object') {
                setState(current, state as StateObject<TValue>);
                return current;
            }
            return state as TValue;
        });
    }

    on<TEvent>(observable: IObservable<TEvent>, reduce: (current: TValue, event: TEvent) => TValue): this {
        let existingSubscription = this._subscriptions.get(observable);
        if (existingSubscription)
            existingSubscription.unsubscribe();

        this._subscriptions.set(observable,
            observable.subscribe(value => {
                accessed.reductions.length = 0;
                this._current = reduce(this._current, value);
                if (accessed.reductions.some(r => r._subscriptions.has(observable)))
                    throw new Error("Accessed a reduced value derived from the same event being fired.");
                accessed.reductions.length = 0;
                this._subject.next(this._current);
            }));
        return this;
    }

    restore(state: State<TValue>) {
        this._restore.next(state);
    }

    onRestore(reduce: (current: TValue, state: State<TValue>) => TValue): this {
        return this.on(this._restore, reduce);
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