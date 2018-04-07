import { IObservable, Observable } from './observable';
import { Subject } from "./subject";
import { ObjectDiff } from "./types";

export interface IEventMethods<TIn, TOut> {
    scope<TIn extends object, TOut extends TIn, TScope extends Partial<TIn>>(scope: TScope): IObservableEvent<ObjectDiff<TIn, TScope>, TOut>;
}

export type Event<T> = T extends void
    ? () => void
    : (item: T) => void;
    
export type IObservableEvent<TIn, TOut> = Event<TIn> & IEventMethods<TIn, TOut> & IObservable<TOut>;

export function event<T = void>(): IObservableEvent<T, T> {
    let subject = new Subject<T>();
    return makeObservableEvent((value => subject.next(value)) as Event<T>, subject);
}

class ObservableEvent<TIn, TOut> extends Observable<TOut> {
    constructor(source: IObservable<TOut>) {
        super(observer => source.subscribe(v => observer.next(v)));
    }

    scope<TIn extends object, TOut extends TIn, TScope extends Partial<TIn>>(this: IObservableEvent<TIn, TOut>, scope: TScope): IObservableEvent<ObjectDiff<TIn, TScope>, TOut> {
        let scopedEvent = (value: ObjectDiff<TIn, TScope>) => this(Object.assign(value, scope) as any as TIn);
        let scopedObservable = this.filter(value => Object.keys(scope)
            .every(p => value[p as keyof TIn] == scope[p as keyof TIn]));
        return makeObservableEvent(scopedEvent, scopedObservable);
    }
}

export function makeObservableEvent<TIn, TOut>(event: Event<TIn>, observable: IObservable<TOut>): IObservableEvent<TIn, TOut> {
    Object.setPrototypeOf(event, new ObservableEvent(observable));
    event.apply = Function.prototype.apply;
    return event as IObservableEvent<TIn, TOut>;
}