import { ensureNotInsideDerivation } from "./derivation";
import { log, logEvent } from "./logging";
import { IObservable, ObservableOperation } from "./observable";
import { ISubject, Subject } from "./subject";
import { ObjectOmit } from "./types";
import { NamedBase, filteredName, matchesScope, scopedName } from "./utils";

export interface IEventBase {
    displayName: string;
    container?: any;
}

/** Event implementation */
export interface IEventClass extends IEventBase {
    next(...args: any): void;
}

export interface IEvent<TIn = void, TOut = TIn> extends IObservable<TOut>, IEventBase {
    (eventValue: TIn): void;
    scope<ObjectIn extends Scope, ObjectOut extends Scope, Scope extends object>(this: IEvent<ObjectIn, ObjectOut>, scope: Scope): IEvent<ObjectOmit<ObjectIn, Scope>, ObjectOut>;
}

export interface IAsyncObservables<Result = void, Context = void> {
    readonly started: IObservable<AsyncStart<Result, Context>>;
    readonly resolved: IObservable<AsyncResult<Result, Context>>;
    readonly rejected: IObservable<AsyncError<Context>>;
}

export interface IFilterableAsyncObservables<Result = void, Context = void> extends IAsyncObservables<Result, Context>, IEventBase {
    filter(predicate: (context: Context) => boolean): IFilterableAsyncObservables<Result, Context>;
}

export interface IAsyncEvent<Result = void, ContextIn = void, ContextOut = ContextIn> extends IFilterableAsyncObservables<Result, ContextOut> {
    (promise: PromiseLike<Result>, context: ContextIn): void;
    scope<ObjectContext extends Scope, Scope extends object>(this: IAsyncEvent<Result, ObjectContext>, scope: Scope): IAsyncEvent<Result, ObjectOmit<ObjectContext, Scope>, ObjectContext>;
}

export interface AsyncStart<Result, Context> {
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

export function event<T = void>(name = anonymousEvent): IEvent<T> {
    return makeEventFunction(new EventSubject<T>(() => name));
}

class EventBase<TOut> extends ObservableOperation<TOut> {
    container?: any;

    scope<ObjectIn extends Scope, ObjectOut extends Scope, Scope extends object>(this: IEvent<ObjectIn, ObjectOut>, scope: Scope) {
        return makeEventFunction(new ScopedEventSubject<ObjectIn, ObjectOut, Scope>(this, scope));
    }
}

class EventSubject<T> extends EventBase<T> {
    private _subject: ISubject<T>;

    constructor(getDisplayName: () => string) {
        let subject = new Subject<T>(() => this.displayName);
        super(getDisplayName, [subject], observer => subject.subscribe(observer.next, observer.getDisplayName));
        this._subject = subject;
    }

    next(value: T) {
        fireEvent('⚡ (event)', this.displayName, value, () => ({ Container: this.container }),
            () => this._subject.next(value));
    }
}

class ScopedEventSubject<ObjectIn extends Scope, ObjectOut extends Scope, Scope extends object> extends EventBase<ObjectOut> {
    constructor(private _source: IEvent<ObjectIn, ObjectOut>, private _scope: Scope) {
        super(() => scopedName(_source.displayName, _scope), [_source],
            observer => _source.subscribe(value => matchesScope(_scope, value) && observer.next(value), observer.getDisplayName));
    }

    next(partial: ObjectOmit<ObjectIn, Scope>) {
        // Using plain log so only the unscoped event is logged as an event
        log('{⚡} (scoped event)', this.displayName, [partial], () => ({ Scope: this._scope, Container: this.container }),
            () => this._source({ ...partial, ...this._scope } as ObjectIn));
    }
}

/** Creates an event that takes promises as inputs, along with an optional context value */
export function asyncEvent<Result = void, Context = void>(name = '(anonymous async event)'): IAsyncEvent<Result, Context> {
    return makeEventFunction(new AsyncEvent<Result, Context>(() => name));
}

abstract class FilterableAsyncObservables<Result, Context> extends NamedBase {
    container?: any;

    abstract readonly started: IObservable<AsyncStart<Result, Context>>;
    abstract readonly resolved: IObservable<AsyncResult<Result, Context>>;
    abstract readonly rejected: IObservable<AsyncError<Context>>;

    filter(predicate: (context: Context) => boolean): IFilterableAsyncObservables<Result, Context> {
        return new FilteredAsyncObservables(this, predicate);
    }
}

class FilteredAsyncObservables<Result, Context> extends FilterableAsyncObservables<Result, Context> {
    constructor(private _source: IFilterableAsyncObservables<Result, Context>, private _predicate: (context: Context) => boolean) {
        super(() => filteredName(_source.displayName, _predicate));
    }

    readonly started = this._source.started.filter(s => this._predicate(s.context), () => `${this.displayName}.started`);
    readonly resolved = this._source.resolved.filter(r => this._predicate(r.context), () => `${this.displayName}.resolved`);
    readonly rejected = this._source.rejected.filter(r => this._predicate(r.context), () => `${this.displayName}.rejected`);
}

abstract class AsyncEventBase<Result, Context> extends FilterableAsyncObservables<Result, Context> {
    scope<ObjectContextIn extends Scope, ObjectContextOut extends Scope, Scope extends object>(this: IAsyncEvent<Result, ObjectContextIn, ObjectContextOut>, scope: Scope) {
        return makeEventFunction(new ScopedAsyncEvent<Result, ObjectContextIn, ObjectContextOut, Scope>(this, scope));
    }
}

class AsyncEvent<Result, Context> extends AsyncEventBase<Result, Context> {
    readonly started = new Subject<AsyncStart<Result, Context>>(() => `${this.displayName}.started`);
    readonly resolved = new Subject<AsyncResult<Result, Context>>(() => `${this.displayName}.resolved`);
    readonly rejected = new Subject<AsyncError<Context>>(() => `${this.displayName}.rejected`);

    next(promise: PromiseLike<Result>, context: Context) {
        fireEvent('⚡⌚ (async event)', this.displayName + '.started', { promise, context }, () => ({ Promise: promise, Container: this.container }),
            () => this.started.next({ promise, context }));

        promise.then(
            result => fireEvent('⚡✔ (async result)', this.displayName + '.resolved', { result, context }, () => ({ Promise: promise, Container: this.container }),
                () => this.resolved.next({ result, context })),
            error => fireEvent('⚡❌ (async error)', this.displayName + '.rejected', { error, context }, () => ({ Promise: promise, Container: this.container }),
                () => this.rejected.next({ error, context })));
    }
}

class ScopedAsyncEvent<Result, ContextIn extends Scope, ContextOut extends Scope, Scope extends object> extends AsyncEventBase<Result, ContextOut> {
    constructor(private _source: IAsyncEvent<Result, ContextIn, ContextOut>, private _scope: Scope) {
        super(() => scopedName(_source.displayName, _scope));
    }

    readonly started = this._source.started.filter(s => matchesScope(this._scope, s.context), () => `${this.displayName}.started`);
    readonly resolved = this._source.resolved.filter(r => matchesScope(this._scope, r.context), () => `${this.displayName}.resolved`);
    readonly rejected = this._source.rejected.filter(e => matchesScope(this._scope, e.context), () => `${this.displayName}.rejected`);

    next(promise: PromiseLike<Result>, partialContext: ObjectOmit<ContextIn, Scope>) {
        // Using plain log so only the unscoped event is logged as an event
        log('{⚡⌚} (scoped async event)', this.displayName, [partialContext], () => ({ Scope: this._scope, Container: this.container }),
            () => this._source(promise, { ...this._scope, ...partialContext } as ContextIn));
    }
}

/** Converts an event class into a callable function */
export function makeEventFunction<Event extends IEventClass>(event: Event) {
    Object.setPrototypeOf(eventFn, event);
    eventFn.apply = Function.prototype.apply;
    Object.defineProperty(eventFn, 'displayName', { // Delegate to prototype, since already initialised Subjects' displayNames will have captured the prototype as 'this'
        get() { return event.displayName; },
        set(value: string) { event.displayName = value; }
    });
    return eventFn as Event & Event['next'];

    function eventFn(...args: any) {
        event.next.apply(eventFn, args);
    }
}

/** Logs event and ensures no other events are run at the same time. */
export function fireEvent(type: string, displayName: string, arg: any, getInfo: (() => object) | undefined, runEvent: () => void) {
    logEvent(type, displayName, arg, getInfo, () => {
        try {
            if (currentlyFiringEvent)
                throw new ChainedEventsError(currentlyFiringEvent, displayName);

            ensureNotInsideDerivation(displayName || anonymousEvent);

            currentlyFiringEvent = displayName || anonymousEvent;
            runEvent();
        } finally {
            currentlyFiringEvent = null;
        }
    });
}

let currentlyFiringEvent = null as string | null;
const anonymousEvent = '(anonymous event)';

export class ChainedEventsError extends Error {
    constructor(
        public currentEvent: string,
        public newEvent = anonymousEvent
    ) {
        super(`Events should not be fired in response to other events. Fired '${newEvent}' in response to '${currentEvent}'.`)
    }
}