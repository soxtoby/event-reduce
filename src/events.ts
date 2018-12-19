import { IObservable, ISimpleObservable, Observable } from './observable';
import { Subject } from "./subject";
import { ObjectDiff } from "./types";

type Scopable<TIn, TOut> = TIn extends object ? TOut extends TIn
    ? { scope<TScope extends Partial<TIn>>(scope: TScope): IObservableEvent<ObjectDiff<TIn, TScope>, TOut> }
    : {} : {};

export type Event<T> = T extends void
    ? () => void
    : (item: T) => void;

export type IObservableEvent<TIn, TOut = TIn> = Event<TIn> & Scopable<TIn, TOut> & ISimpleObservable<TOut>;

let insideEvent = false;

/**
 * Creates an observable event function.
 */
export function event<T = void>(): IObservableEvent<T, T> {
    let subject = new Subject<T>();
    return combineEventAndObservable((value => {
        try {
            if (insideEvent)
                throw new Error("Fired an event in response to another event.");

            insideEvent = true;
            subject.next(value);
        }
        finally {
            insideEvent = false;
        }
    }) as Event<T>, subject);
}

class ObservableEvent<TIn, TOut> extends Observable<TOut> {
    constructor(source: IObservable<TOut>) {
        super(observer => source.subscribe(v => observer.next(v)));
    }

    scope<TIn2 extends TIn & object, TOut2 extends TIn2, TScope extends Partial<TIn>>(this: IObservableEvent<TIn2, TOut2>, scope: TScope): IObservableEvent<ObjectDiff<TIn2, TScope>, TOut2> {
        let scopedEvent = (value: ObjectDiff<TIn2, TScope>) => this(Object.assign(value, scope));
        let scopedObservable = this.filter(value => Object.keys(scope)
            .every(p => value[p as keyof TIn] == scope[p as keyof TIn]));
        return combineEventAndObservable(scopedEvent, scopedObservable);
    }
}

export function combineEventAndObservable<TIn, TOut>(event: Event<TIn>, observable: IObservable<TOut>): IObservableEvent<TIn, TOut> {
    Object.setPrototypeOf(event, new ObservableEvent(observable));
    event.apply = Function.prototype.apply;
    return event as IObservableEvent<TIn, TOut>;
}