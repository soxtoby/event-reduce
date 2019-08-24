import { Subject, ISubject } from "./subject";
import { Observable, ScopedObservable } from "./observable";
import { ObjectOmit } from "./types";

export function event<T = void>(name = '(anonymous event)') {
    let subject = new EventSubject<T>(name);
    return makeEvent(subject.next.bind(subject), subject);
}

export function asyncEvent<Result = void, Context = void>(name = '(anonymous async event)') {
    let asyncEvent = new AsyncEvent<Result, Context>(name);
    return makeEvent(asyncEvent.next.bind(asyncEvent), asyncEvent);
}

class EventSubject<T> extends Subject<T> {
    scope<TObject extends object, Scope extends Partial<TObject>>(this: ISubject<TObject>, scope: Scope) {
        let scopedEvent = new ScopedEventSubject<TObject, Scope>(this, scope);
        return makeEvent(scopedEvent.next.bind(scopedEvent), scopedEvent);
    }
}

class ScopedEventSubject<T extends object, Scope extends Partial<T>> extends ScopedObservable<T, Scope> {
    constructor(
        private _source: ISubject<T>,
        private _scope: Scope
    ) {
        super(_source, _scope);
    }

    next(partial: ObjectOmit<T, Scope>) {
        this._source.next({ ...partial, ...this._scope } as any as T);
    }

    scope<TObject extends object, SubScope extends Partial<TObject>>(this: ISubject<TObject>, scope: SubScope) {
        let scopedEvent = new ScopedEventSubject<TObject, SubScope>(this, scope);
        return makeEvent(scopedEvent.next.bind(scopedEvent), scopedEvent);
    }
}

class AsyncEvent<Result = void, Context = void> implements IEventBase {
    private _displayName!: string;
    private _started = new Subject<AsyncItem<Result, Context>>('');
    private _resolved = new Subject<AsyncResult<Result, Context>>('');
    private _rejected = new Subject<AsyncError<Context>>('');

    constructor(displayName: string) {
        this.displayName = displayName;
    }

    get displayName() { return this._displayName; }

    set displayName(name: string) {
        this._displayName = name;
        this._started.displayName = `${name}.started`;
        this._resolved.displayName = `${name}.resolved`;
        this._rejected.displayName = `${name}.rejected`;
    }

    next(promise: PromiseLike<Result>, context: Context) {
        promise.then(
            result => this._resolved.next({ result, context }),
            error => this._rejected.next({ error, context }));
        this._started.next({ promise, context });
    }

    get started() { return this._started as Observable<AsyncItem<Result, Context>>; }
    get resolved() { return this._resolved as Observable<AsyncResult<Result, Context>>; }
    get rejected() { return this._rejected as Observable<AsyncError<Context>>; }
}

interface AsyncItem<Result, Context> {
    promise: PromiseLike<Result>;
    context: Context;
}

interface AsyncResult<Result, Context> {
    result: Result;
    context: Context;
}

interface AsyncError<Context> {
    error: any;
    context: Context;
}

export function makeEvent<Fn extends (...args: any[]) => void, Event extends IEventBase>(eventFn: Fn, prototype: Event) {
    Object.setPrototypeOf(fireEvent, prototype);
    fireEvent.apply = Function.prototype.apply;
    return fireEvent as Fn & Event;

    function fireEvent(...args: any[]) {
        try {
            if (insideEvent)
                throw new Error("Fired an event in response to another event.");

            insideEvent = true;
            eventFn(...args);
        } finally {
            insideEvent = false;
        }
    }
}

let insideEvent = false;

export interface IEventBase {
    displayName: string;
}