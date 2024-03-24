import { log, sourceTree } from "./logging";
import { IObservable, allSources, isObservable } from "./observable";
import { IObservableValue, ObservableValue, protectAgainstAccessingValueWithCommonSource, valueChanged } from "./observableValue";
import { State, setState } from "./state";
import { Subject } from "./subject";
import { Unsubscribe } from "./types";
import { isObject } from "./utils";

export function reduce<TValue>(initial: TValue, displayName?: string): IReduction<TValue>;
export function reduce<TValue, TEvents>(initial: TValue, events: TEvents, displayName?: string): IBoundReduction<TValue, TEvents>;
export function reduce<TValue, TEvents>(initial: TValue, events?: TEvents | string, displayName: string = '(anonymous reduction)'): IReduction<TValue> {
    return events && typeof events != 'string' ? new BoundReduction(() => displayName, initial, events)
        : typeof events == 'string' ? new Reduction(() => events, initial)
            : new Reduction(() => displayName, initial);
}

type Reducer<TValue, TEvent> = (previous: TValue, eventValue: TEvent) => TValue;

export interface IReduction<T> extends IObservableValue<T> {
    on<TEvent>(observable: IObservable<TEvent>, reduce: Reducer<T, TEvent>): this;
    /** @deprecated use valueChanged function instead */
    onValueChanged<TValue>(observableVaue: TValue, reduce: Reducer<T, TValue>): this;
    onRestore(reduce: Reducer<T, State<T>>): this;
}

export interface IBoundReduction<T, TEvents> extends IReduction<T> {
    on<TEvent>(observable: ((events: TEvents) => IObservable<TEvent>) | IObservable<TEvent>, reduce: Reducer<T, TEvent>): this;
}

export class Reduction<T> extends ObservableValue<T> implements IReduction<T> {
    private _sources = new Map<IObservable<any>, Unsubscribe>();
    private _restore = new RestoreSubject<State<T>>(() => `${this.displayName}.restored`);

    constructor(getDisplayName: () => string, initial: T) {
        super(getDisplayName, initial);

        this.onRestore((current, state) => {
            if (isObject(current)) {
                setState(current, state);
                return current;
            }
            return state as T;
        });
    }

    override get sources() { return Array.from(this._sources.keys()); }

    restore(state: State<T>): void {
        this._restore.next(state);
    }

    on<TEvent>(observable: IObservable<TEvent>, reduce: Reducer<T, TEvent>) {
        if (allSources(observable.sources).has(this))
            throw new CircularSubscriptionError(this, observable);

        let unsubscribeExisting = this._sources.get(observable);
        if (unsubscribeExisting)
            unsubscribeExisting();

        this._sources.set(observable, observable.subscribe(eventValue => {
            let previousValue = this._value;
            let value!: T;

            log('🧪 (reduction)', this.displayName, [], () => ({
                Previous: previousValue,
                Current: value,
                Container: this.container,
                Sources: sourceTree(this.sources)
            }), () => {
                protectAgainstAccessingValueWithCommonSource(observable, () => value = reduce(this._value, eventValue));
                this.setValue(value)
            });
        }, () => this.displayName));

        this.clearSourceInfo();

        return this;
    }

    onValueChanged<TValue>(observableValue: TValue, reduce: Reducer<T, TValue>) {
        return this.on(valueChanged(observableValue), reduce);
    }

    onRestore(reduce: Reducer<T, State<T>>): this {
        return this.on(this._restore, reduce);
    }

    override unsubscribeFromSources() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}

class BoundReduction<TValue, TEvents> extends Reduction<TValue> implements IBoundReduction<TValue, TEvents> {
    constructor(
        getDisplayName: () => string,
        initial: TValue,
        private _events: TEvents = {} as TEvents
    ) { super(getDisplayName, initial); }

    override on<TEvent>(observable: ((events: TEvents) => IObservable<TEvent>) | IObservable<TEvent>, reduce: Reducer<TValue, TEvent>): this {
        return super.on(isObservable(observable) ? observable : observable(this._events), reduce);
    }
}

export class RestoreSubject<T> extends Subject<T> { }

export class CircularSubscriptionError extends Error {
    constructor(
        public reduction: IReduction<unknown>,
        public observable: IObservable<unknown>
    ) {
        super(`Cannot subscribe to '${observable.displayName}', as it depends on this reduction, '${reduction.displayName}'.`);
    }
}