import { setState, State, StateObject } from "./experimental/state";
import { Subject } from "./subject";
import { ObservableValue, collectAccessedValues, lastAccessed } from "./observableValue";
import { Observable, Unsubscribe, allSources } from "./observable";

export function reduce<TValue>(initial: TValue, displayName?: string): Reduction<TValue>;
export function reduce<TValue, TEvents>(initial: TValue, events: TEvents, displayName?: string): BoundReduction<TValue, TEvents>;
export function reduce<TValue, TEvents>(initial: TValue, events?: TEvents | string, displayName: string = '(anonymous reduction)'): Reduction<TValue> {
    return events && typeof events != 'string' ? new BoundReduction(() => displayName, initial, events)
        : typeof events == 'string' ? new Reduction(() => events, initial)
            : new Reduction(() => displayName, initial);
}

type Reducer<TValue, TEvent> = (previous: TValue, eventValue: TEvent) => TValue;

class Reduction<T> extends ObservableValue<T> {
    private _sources = new Map<Observable<any>, Unsubscribe>();
    private _restore = new Subject<State<T>>(() => `${this.displayName}.restored`);

    constructor(getDisplayName: () => string, initial: T) {
        super(getDisplayName, initial);

        this.onRestore((current, state) => {
            if (current && typeof current == 'object') {
                setState(current, state as StateObject<T>);
                return current;
            }
            return state as T;
        });
    }

    get sources() { return Array.from(this._sources.keys()); }

    restore(state: State<T>): void {
        this._restore.next(state);
    }

    on<TEvent>(observable: Observable<TEvent>, reduce: Reducer<T, TEvent>) {
        if (allSources(observable.sources).has(this))
            throw new Error(`Cannot subscribe to '${observable.displayName}', as it depends on this reduction, '${this.displayName}'.`);

        let unsubscribeExisting = this._sources.get(observable);
        if (unsubscribeExisting)
            unsubscribeExisting();

        this._sources.set(observable, observable.subscribe(eventValue => {
            let value!: T;
            let sources = collectAccessedValues(() => value = reduce(this._value, eventValue));

            let accessedSources = allSources(sources);
            let triggeringSources = allSources([observable]);
            let commonSource = firstIntersection(accessedSources, triggeringSources);
            if (commonSource)
                throw new Error("Accessed a reduced value derived from the same event being fired.")

            this.setValue(value);
        }, () => this.displayName));

        return this;
    }

    onValueChanged<TValue>(observableValue: TValue, reduce: Reducer<T, TValue>) {
        if (lastAccessed.observableValue && lastAccessed.observableValue.value == observableValue)
            return this.on(lastAccessed.observableValue, reduce);
        throw new Error("Couldn't detect observable value. Make sure you pass in an observable value directly.");
    }

    onRestore(reduce: (current: T, state: State<T>) => T): this {
        return this.on(this._restore, reduce);
    }

    unsubscribeFromSources() {
        this._sources.forEach(unsub => unsub());
        this._sources.clear();
    }
}

function firstIntersection<T>(a: Set<T>, b: Set<T>) {
    for (let item of a)
        if (b.has(item))
            return item;
}

export class BoundReduction<TValue, TEvents> extends Reduction<TValue> {
    constructor(
        getDisplayName: () => string,
        initial: TValue,
        private _events: TEvents = {} as TEvents
    ) { super(getDisplayName, initial); }

    on<TEvent>(observable: ((events: TEvents) => Observable<TEvent>) | Observable<TEvent>, reduce: Reducer<TValue, TEvent>): this {
        return super.on(typeof observable == 'function' ? observable(this._events) : observable, reduce);
    }
}