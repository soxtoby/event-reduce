import { log, logEvent } from "./logging";
import { IObservable, ScopedObservable } from "./observable";
import { ISubject, Subject } from "./subject";
import { ObjectOmit } from "./types";

export interface IEvent<T> extends Omit<ISubject<T>, 'scope'> {
    (eventValue: T): void;
    scope<TObject extends object, Scope extends Partial<TObject>>(this: ISubject<TObject>, scope: Scope): IScopedEvent<TObject, Scope>;
}

export interface IScopedEvent<T extends object, Scope extends object> extends Omit<ISubject<T>, 'scope'> {
    (eventValue: ObjectOmit<T, Scope>): void;
    scope<TObject extends object, Scope extends Partial<TObject>>(this: ISubject<TObject>, scope: Scope): IScopedEvent<TObject, Scope>;
}

export interface IAsyncEvent<Result, Context> {
    (promise: PromiseLike<Result>, context: Context): void;
    readonly started: IObservable<AsyncItem<Result, Context>>;
    readonly resolved: IObservable<AsyncResult<Result, Context>>;
    readonly rejected: IObservable<AsyncError<Context>>;
}

export interface AsyncItem<Result, Context> {
    promise: PromiseLike<Result>;
    context: Context;
}

export interface AsyncResult<Result, Context> {
    result: Result;
    context: Context;
}

export interface AsyncError<Context> {
    error: any;
    context: Context;
}

export function event<T = void>(name = '(anonymous event)'): IEvent<T> {
    let subject = new EventSubject<T>(() => name);
    return makeEvent(subject);
}

export function asyncEvent<Result = void, Context = void>(name = '(anonymous async event)'): IAsyncEvent<Result, Context> {
    let asyncEvent = new AsyncEvent<Result, Context>(name);
    return makeEvent(asyncEvent);
}

class EventSubject<T> extends Subject<T> implements IEventBase {
    next(value: T) {
        logEvent('⚡ (event)', this.displayName, value, undefined,
            () => super.next(value));
    }

    scope<TObject extends object, Scope extends Partial<TObject>>(this: ISubject<TObject>, scope: Scope) {
        let scopedEvent = new ScopedEventSubject<TObject, Scope>(this, scope);
        return makeEvent(scopedEvent);
    }
}

class ScopedEventSubject<T extends object, Scope extends Partial<T>> extends ScopedObservable<T, Scope> implements IEventBase {
    constructor(
        private _source: ISubject<T>,
        private _scope: Scope
    ) {
        super(_source, _scope);
    }

    next(partial: ObjectOmit<T, Scope>) {
        // Using plain log so only the unscoped event is logged as an event
        log('{⚡} (scoped event)', this.displayName, [partial], { Scope: this._scope },
            () => this._source.next({ ...partial, ...this._scope } as any as T));
    }

    scope<TObject extends object, SubScope extends Partial<TObject>>(this: ISubject<TObject>, scope: SubScope) {
        let scopedEvent = new ScopedEventSubject<TObject, SubScope>(this, scope);
        return makeEvent(scopedEvent);
    }
}

class AsyncEvent<Result = void, Context = void> implements IEventBase {
    private _started = new Subject<AsyncItem<Result, Context>>(() => `${this.displayName}.started`);
    private _resolved = new Subject<AsyncResult<Result, Context>>(() => `${this.displayName}.resolved`);
    private _rejected = new Subject<AsyncError<Context>>(() => `${this.displayName}.rejected`);

    constructor(public displayName: string) { }

    next(promise: PromiseLike<Result>, context: Context) {
        promise.then(
            result => logEvent('⚡✔ (async result)', this.displayName + '.resolved', context, { Promise: promise },
                () => this._resolved.next({ result, context })),
            error => logEvent('⚡❌ (async error)', this.displayName + '.rejected', context, { Promise: promise },
                () => this._rejected.next({ error, context })));

        logEvent('⚡⌚ (async event)', this.displayName + '.started', context, { Promise: promise },
            () => this._started.next({ promise, context }));
    }

    get started() { return this._started as IObservable<AsyncItem<Result, Context>>; }
    get resolved() { return this._resolved as IObservable<AsyncResult<Result, Context>>; }
    get rejected() { return this._rejected as IObservable<AsyncError<Context>>; }
}

export function makeEvent<Fn extends (...args: any[]) => void, Event extends IEventBase>(prototype: Event) {
    Object.setPrototypeOf(fireEvent, prototype);
    fireEvent.apply = Function.prototype.apply;
    return fireEvent as Fn & Event;

    function fireEvent(...args: any[]) {
        try {
            if (insideEvent)
                throw new Error("Fired an event in response to another event.");

            insideEvent = true;
            prototype.next.apply(fireEvent, args);
        } finally {
            insideEvent = false;
        }
    }
}

let insideEvent = false;

export interface IEventBase {
    displayName: string;
    next(...args: any[]): void;
}
