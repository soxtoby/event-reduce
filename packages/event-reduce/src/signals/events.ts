import { dispose } from "../utils"
import { startLogging } from "./logging"
import { applyScope, DeepPartial, matchesScope, Scoped } from "./scoping"
import { ISource, SourceBase } from "./signals"

export interface IEvent<T, Args extends any[] = [T]> extends ISource<T> {
    (...args: Args): Args[0]
}

export function event<T = void>(name: string = "(anonymous event)"): IEvent<T> {
    return makeEventFunction(name, (emit: (value: T) => void, event: T) => {
        let logging = startLogging('⚡ (event)', name, [event]) // NOCOMMIT Container
        try {
            emit(event)
        } finally {
            logging?.[dispose]()
        }
        return event
    }, e => ({
        scope<Scope extends DeepPartial<T>>(scope: Scope) {
            return bindEvent(e, `${e.displayName}.scoped(${JSON.stringify(scope)})`,
                (value: Scoped<T, Scope>) => e(applyScope(value, scope)),
                value => matchesScope(value, scope))
        }
    }))
}

export interface IAsyncEvent<Result, Context> extends IEvent<AsyncValue<Result, Context>, [PromiseLike<Result>, Context]> {
    started: ISource<AsyncStart<Result, Context>>
    resolved: ISource<AsyncResult<Result, Context>>
    rejected: ISource<AsyncError<Context>>
}

export type AsyncValue<Result, Context> =
    | AsyncStart<Result, Context>
    | AsyncResult<Result, Context>
    | AsyncError<Context>

export interface AsyncStart<Result, Context> {
    context: Context
    promise: PromiseLike<Result>
}

export interface AsyncResult<Result, Context> {
    context: Context
    result: Result
}

export interface AsyncError<Context> {
    context: Context
    error: any
}

export function asyncEvent<Result = void, Context = void>(name: string = "(anonymous async event)"): IAsyncEvent<Result, Context> {
    return makeEventFunction(name, <P extends PromiseLike<Result>>(emit: (value: AsyncValue<Result, Context>) => void, promise: P, context: Context) => {
        let logging = startLogging('⚡⌚ (async event)', name, [promise, context], () => ({ Promise: promise })) // NOCOMMIT Container
        try {
            emit({ promise, context })
        } finally {
            logging?.[dispose]()
        }

        promise.then(
            result => {
                let val = { result, context }
                let logging = startLogging('⚡✔ (async resolved)', name, [val], () => ({ Promise: promise })) // NOCOMMIT Container
                try {
                    emit(val)
                } finally {
                    logging?.[dispose]()
                }
            },
            error => {
                let val = { error, context }
                let logging = startLogging('⚡✘ (async rejected)', name, [val], () => ({ Promise: promise })) // NOCOMMIT Container
                try {
                    emit(val)
                } finally {
                    logging?.[dispose]()
                }
            })

        return promise
    }, e => ({
        started: e.filter(v => 'promise' in v, `${e.displayName}.started`),
        resolved: e.filter(v => 'result' in v, `${e.displayName}.resolved`),
        rejected: e.filter(v => 'error' in v, `${e.displayName}.rejected`),
        scope<Scope extends DeepPartial<Context>>(scope: Scope) {
            return bindEvent(e, `${e.displayName}.scoped(${JSON.stringify(scope)})`,
                (promise: PromiseLike<Result>, context: Scoped<Context, Scope>) => e(promise, applyScope(context, scope)),
                value => matchesScope(value.context, scope))
        }
    }))
}

/** Converts an event class into a callable function */
export function makeEventFunction<T, Args extends any[] = [T], Return = Args[0], Members extends object = {}>(
    name: string,
    fire: (emit: (event: T) => void, ...args: Args) => Return,
    getMembers?: (event: IEvent<T, Args>) => Members
) {
    let eventBase = new Event<T>(name)
    let eventFn = fire.bind(null, eventBase.emit) as IEvent<T, Args>
    Object.setPrototypeOf(eventFn, eventBase);
    eventFn.apply = Function.prototype.apply;
    eventFn.call = Function.prototype.call;
    return Object.assign(eventFn, getMembers?.(eventFn as IEvent<T, Args>) ?? {}) as IEvent<T, Args> & Members
}

class Event<T> extends SourceBase<T> {
    emit = (value: T) => this.setValue(value, true)
}

export function isEvent(value: any): value is IEvent<any> {
    return typeof value == 'function'
        && value instanceof Event
}

/** 
 * Transforms an event by wrapping the function, and filtering the emitted values. 
 * Useful for scope functions.
*/
export function bindEvent<E extends IEvent<any, any>, ScopedArgs extends any[]>(
    baseEvent: E,
    displayName: string,
    scopedFn: (...args: ScopedArgs) => ReturnType<E>,
    eventPredicate: (value: EventValue<E>) => boolean
): IEvent<EventValue<E>, ScopedArgs> {
    let scopedEvent = scopedFn as IEvent<EventValue<E>, ScopedArgs>
    Object.setPrototypeOf(scopedEvent, Object.create(baseEvent, {
        skipUpdate: { value: (next: EventValue<E>) => (baseEvent as any).skipUpdate(next) || !eventPredicate(next) }
    }));
    scopedEvent.displayName = displayName
    return scopedEvent
}

type EventValue<Event extends IEvent<any, any>> = Event extends IEvent<infer T, any> ? T : never