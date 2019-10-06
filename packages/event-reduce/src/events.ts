import { log, logEvent } from "./logging";
import { IObservable, ObservableOperation } from "./observable";
import { ISubject, Subject } from "./subject";
import { ObjectOmit } from "./types";
import { matchesScope } from "./scoping";

export interface IEvent<TIn = void, TOut = TIn> extends IObservable<TOut> {
    (eventValue: TIn): void;
    displayName: string;
    scope<ObjectT extends object, Scope extends Partial<ObjectT>>(this: IEvent<ObjectT>, scope: Scope): IEvent<ObjectOmit<ObjectT, Scope>, TOut>;
}

export interface IAsyncEventObservables<Result = void, Context = void> {
    readonly started: IObservable<AsyncStart<Result, Context>>;
    readonly resolved: IObservable<AsyncResult<Result, Context>>;
    readonly rejected: IObservable<AsyncError<Context>>;
}

export interface IAsyncEvent<Result = void, ContextIn = void, ContextOut = ContextIn> extends IAsyncEventObservables<Result, ContextOut> {
    (promise: PromiseLike<Result>, context: ContextIn): void;
    displayName: string;
    scope<ObjectContext extends object, Scope extends Partial<ObjectContext>>(this: IAsyncEvent<Result, ObjectContext>, scope: Scope): IAsyncEvent<Result, ObjectOmit<ObjectContext, Scope>, ObjectContext>;
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

export function event<T = void>(name = '(anonymous event)'): IEvent<T> {
    return makeEvent(function next(value: T) {
        fireEvent('⚡ (event)', this.displayName, value, () => ({ Container: this.container }),
            () => this.next(value));
    }, new Subject<T>(() => name));
}

function makeEvent<Args extends any[], Proto extends object, TIn = void, TOut = TIn>(next: (this: Proto & IEventBase, ...args: Args) => void, proto: Proto): IEvent<TIn, TOut> {
    return makeEventFunction(next, Object.create(proto, Object.getOwnPropertyDescriptors({
        scope<TObject extends Scope, Scope extends object>(this: ISubject<TObject>, scope: Scope) {
            let source = this;
            return makeEvent(function next(partial: ObjectOmit<TObject, Scope>) {
                // Using plain log so only the unscoped event is logged as an event
                log('{⚡} (scoped event)', this.displayName, [partial], () => ({ Scope: scope, Container: this.container }),
                    () => source.next({ ...partial, ...scope } as any as TObject));

            }, new ObservableOperation<TObject>(
                () => `${this.displayName}.scoped({ ${Object.entries(scope).map(([k, v]) => `${k}: ${v}`).join(', ')} })`,
                [source],
                observer => source.subscribe(value => matchesScope(scope)(value) && observer.next(value), observer.getDisplayName)));
        }
    })));
}

export function asyncEvent<Result = void, Context = void>(name = '(anonymous async event)'): IAsyncEvent<Result, Context> {
    return makeAsyncEvent(function next(promise: PromiseLike<Result>, context: Context) {
        promise.then(
            result => fireEvent('⚡✔ (async result)', this.displayName + '.resolved', context, () => ({ Promise: promise, Container: this.container }),
                () => this.resolved.next({ result, context })),
            error => fireEvent('⚡❌ (async error)', this.displayName + '.rejected', context, () => ({ Promise: promise, Container: this.container }),
                () => this.rejected.next({ error, context })));

        fireEvent('⚡⌚ (async event)', this.displayName + '.started', context, () => ({ Promise: promise, Container: this.container }),
            () => this.started.next({ promise, context }));
    }, {
        started: new Subject<AsyncStart<Result, Context>>(function (this: IAsyncEvent<Result, Context>) { return `${this.displayName}.started` }),
        resolved: new Subject<AsyncResult<Result, Context>>(function (this: IAsyncEvent<Result, Context>) { return `${this.displayName}.resolved` }),
        rejected: new Subject<AsyncError<Context>>(function (this: IAsyncEvent<Result, Context>) { return `${this.displayName}.rejected` }),
    });
}

function makeAsyncEvent<Args extends any[], Proto extends IAsyncEventObservables<Result, ContextOut>, Result, ContextIn, ContextOut = ContextIn>(next: (this: Proto & IEventBase, ...args: Args) => void, proto: Proto) {
    return makeEventFunction(next, Object.create(proto, Object.getOwnPropertyDescriptors({
        scope<ObjectContext extends Scope, Scope extends object>(this: IAsyncEvent<Result, ObjectContext>, scope: Scope) {
            let source = this;
            return makeAsyncEvent(function next(promise: PromiseLike<Result>, partialContext: ObjectOmit<ObjectContext, Scope>) {
                // Using plain log so only the unscoped event is logged as an event
                log('{⚡⌚} (scoped async event)', this.displayName, [partialContext], () => ({ Scope: scope, Container: this.container }),
                    () => source(promise, { ...scope, ...partialContext } as any as ObjectContext));
            }, {
                started: source.started.filter(s => matchesScope(scope)(s.context)),
                resolved: source.resolved.filter(r => matchesScope(scope)(r.context)),
                rejected: source.rejected.filter(r => matchesScope(scope)(r.context))
            })
        }
    })))
}

export function makeEventFunction<Fn extends (...args: any) => void, Proto extends IEventBase>(next: Fn, prototype: Proto) {
    Object.setPrototypeOf(next, prototype);
    next.apply = Function.prototype.apply;
    return next as Fn & Proto;
}

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

export interface IEventBase {
    displayName: string;
    container?: any;
}
