import { log, logEvent } from "./logging";
import { IObservable, ObservableOperation } from "./observable";
import { matchesScope } from "./scoping";
import { Subject } from "./subject";
import { ObjectOmit } from "./types";
import { extend, filteredName, named, scopedName } from "./utils";

export interface IEventBase {
    displayName: string;
    container?: any;
}

export interface IEvent<TIn = void, TOut = TIn> extends IObservable<TOut>, IEventBase {
    (eventValue: TIn): void;
    scope<ObjectIn extends Scope, ObjectOut extends Scope, Scope extends object>(this: IEvent<ObjectIn, ObjectOut>, scope: Scope): IEvent<ObjectOmit<ObjectIn, Scope>, ObjectOut>;
}

export interface IAsyncEventObservables<Result = void, Context = void> {
    readonly started: IObservable<AsyncStart<Result, Context>>;
    readonly resolved: IObservable<AsyncResult<Result, Context>>;
    readonly rejected: IObservable<AsyncError<Context>>;
}

export interface IFilterableAsyncEvent<Result = void, Context = void> extends IAsyncEventObservables<Result, Context>, IEventBase {
    filter(predicate: (context: Context) => boolean): IFilterableAsyncEvent<Result, Context>;
}

export interface IAsyncEvent<Result = void, ContextIn = void, ContextOut = ContextIn> extends IFilterableAsyncEvent<Result, ContextOut> {
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

/** Creates an event that takes individual values as inputs */
export function event<T = void>(name = '(anonymous event)'): IEvent<T> {
    return makeEvent(function next(value: T) {
        fireEvent('⚡ (event)', this.displayName, value, () => ({ Container: this.container }),
            () => this.next(value));
    }, new Subject<T>(() => name));
}

function makeEvent<TIn, TOut, Proto extends IObservable<TOut>>(next: (this: Proto & IEventBase, value: TIn) => void, proto: Proto) {
    return makeEventFunction(next, extend(proto, {
        scope<ObjectIn extends Scope, ObjectOut extends Scope, Scope extends object>(this: IEvent<ObjectIn, ObjectOut>, scope: Scope) {
            let source = this;
            return makeEvent(
                function next(partial: ObjectOmit<ObjectIn, Scope>) {
                    // Using plain log so only the unscoped event is logged as an event
                    log('{⚡} (scoped event)', this.displayName, [partial], () => ({ Scope: scope, Container: this.container }),
                        () => source({ ...partial, ...scope } as any as ObjectIn));

                },
                new ObservableOperation<ObjectOut>(
                    () => scopedName(this.displayName, scope),
                    [source],
                    observer => source.subscribe(value => matchesScope(scope, value) && observer.next(value), observer.getDisplayName)));
        }
    }));
}

/** Creates an event that takes promises as inputs, along with an optional context value */
export function asyncEvent<Result = void, Context = void>(name = '(anonymous async event)'): IAsyncEvent<Result, Context> {
    let event: IAsyncEvent<Result, Context> = makeAsyncEvent(() => name,
        function next(promise: PromiseLike<Result>, context: Context) {
            promise.then(
                result => fireEvent('⚡✔ (async result)', this.displayName + '.resolved', context, () => ({ Promise: promise, Container: this.container }),
                    () => this.resolved.next({ result, context })),
                error => fireEvent('⚡❌ (async error)', this.displayName + '.rejected', context, () => ({ Promise: promise, Container: this.container }),
                    () => this.rejected.next({ error, context })));

            fireEvent('⚡⌚ (async event)', this.displayName + '.started', context, () => ({ Promise: promise, Container: this.container }),
                () => this.started.next({ promise, context }));
        },
        {
            started: new Subject<AsyncStart<Result, Context>>(() => `${event.displayName}.started`),
            resolved: new Subject<AsyncResult<Result, Context>>(() => `${event.displayName}.resolved`),
            rejected: new Subject<AsyncError<Context>>(() => `${event.displayName}.rejected`)
        });
    return event;
}

function makeAsyncEvent<Result, ContextIn, ContextOut, Observables extends IAsyncEventObservables<Result, ContextOut>>(
    getDisplayName: () => string,
    next: (this: Observables & IEventBase, promise: PromiseLike<Result>, context: ContextIn) => void,
    observables: Observables
) {
    return makeEventFunction(next, extend(filterableAsyncObservable<Result, ContextOut>(getDisplayName)(observables),
        {
            scope<ObjectContext extends Scope, Scope extends object>(this: IAsyncEvent<Result, ObjectContext>, scope: Scope) {
                let source = this;
                let event: IAsyncEvent<Result, ObjectOmit<ObjectContext, Scope>, ObjectContext> =
                    makeAsyncEvent(() => scopedName(this.displayName, scope),
                        function next(promise: PromiseLike<Result>, partialContext: ObjectOmit<ObjectContext, Scope>) {
                            // Using plain log so only the unscoped event is logged as an event
                            log('{⚡⌚} (scoped async event)', this.displayName, [partialContext], () => ({ Scope: scope, Container: this.container }),
                                () => source(promise, { ...scope, ...partialContext } as any as ObjectContext));
                        },
                        {
                            started: source.started.filter(s => matchesScope(scope, s.context), () => `${event.displayName}.started`),
                            resolved: source.resolved.filter(r => matchesScope(scope, r.context), () => `${event.displayName}.resolved`),
                            rejected: source.rejected.filter(e => matchesScope(scope, e.context), () => `${event.displayName}.rejected`)
                        });
                return event;
            }
        }))
}

function filterableAsyncObservable<Result, Context>(getDisplayName: () => string) {
    return <Observables extends IAsyncEventObservables<Result, Context>>(observables: Observables) =>
        extend(named(observables, getDisplayName), {
            filter(predicate: (context: Context) => boolean) {
                let source = this;
                return filterableAsyncObservable<Result, Context>(() => filteredName(source.displayName, predicate))({
                    started: source.started.filter(s => predicate(s.context)),
                    resolved: source.resolved.filter(r => predicate(r.context)),
                    rejected: source.rejected.filter(r => predicate(r.context)),
                });
            }
        });
}

/** Combines an input function with a prototype to produce an event function */
export function makeEventFunction<Fn extends (...args: any) => void, Proto extends IEventBase>(next: Fn, prototype: Proto) {
    Object.setPrototypeOf(next, prototype);
    next.apply = Function.prototype.apply;
    return next as Fn & Proto;
}

/** Logs event and ensures no other events are run at the same time. */
export function fireEvent(type: string, displayName: string, arg: any, getInfo: (() => object) | undefined, runEvent: () => void) {
    logEvent(type, displayName, arg, getInfo, () => {
        try {
            if (insideEvent)
                throw new Error("Fired an event in response to another event.");

            insideEvent = true;
            runEvent();
        } finally {
            insideEvent = false;
        }
    });
}

let insideEvent = false;
