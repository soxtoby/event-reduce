import { IObservable, ISimpleObservable, Observable } from './observable';
import { Subject } from "./subject";

type Scopable<TIn, TOut> = TIn extends object ? TOut extends TIn
    ? { scope<TScope extends Subset<TIn, TScope>>(scope: TScope): IObservableEvent<Omit<TIn, keyof TScope>, TOut> }
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

class ObservableEvent<TIn extends object, TOut> extends Observable<TOut> {
    constructor(source: IObservable<TOut>) {
        super(observer => source.subscribe(v => observer.next(v)));
    }

    scope<TScope extends Subset<TIn, TScope>>(this: IObservableEvent<TIn, TOut>, scope: TScope): IObservableEvent<Omit<TIn, keyof TScope>, TOut> {
        let scopedEvent = (value: Omit<TIn, keyof TScope>) => this(Object.assign(value, scope));
        let scopedObservable = this.filter(value => Object.keys(scope)
            .every(p => value[p as keyof TOut] as any == scope[p as keyof TIn]));
        return combineEventAndObservable(scopedEvent as Event<Omit<TIn, keyof TScope>>, scopedObservable);
    }
}

type Subset<Super, Sub> = { [P in keyof Sub]: P extends keyof Super ? Super[P] : never };

export function combineEventAndObservable<TIn, TOut>(event: Event<TIn>, observable: IObservable<TOut>): IObservableEvent<TIn, TOut> {
    Object.setPrototypeOf(event, new ObservableEvent(observable));
    event.apply = Function.prototype.apply;
    return event as IObservableEvent<TIn, TOut>;
}