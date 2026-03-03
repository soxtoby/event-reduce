import { dispose } from "../utils"
import { startLogging } from "./logging"
import { ISource, SourceBase } from "./signals"

export interface IEvent<T, Args extends [any, ...any[]] = [T]> extends ISource<T> {
    (...args: Args): Args[0]
}

export function event<T = void>(name?: string): IEvent<T> {
    let e = new Event<T>(name ?? "(anonymous event)")
    return makeEventFunction(e, (event: T) => {
        let logging = startLogging('⚡ (event)', e.displayName, [event]) // NOCOMMIT Container
        try {
            e.emit(event)
        } finally {
            logging?.[dispose]()
        }
        return event
    })
}

export class Event<T> extends SourceBase<T> {
    constructor(displayName: string) { super(displayName, () => false) }
    emit(value: T) { this.setValue(value, true) }
}

export function isEvent(value: any): value is IEvent<any> {
    return typeof value == 'function'
        && value instanceof Event
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

export function asyncEvent<Result = void, Context = void>(name?: string): IAsyncEvent<Result, Context> {
    let e = new Event<AsyncValue<Result, Context>>(name ?? "(anonymous async event)")
    let fn = makeEventFunction(e, <P extends PromiseLike<Result>>(promise: P, context: Context) => {
        let logging = startLogging('⚡⌚ (async event)', e.displayName, [promise, context], () => ({ Promise: promise })) // NOCOMMIT Container
        try {
            e.emit({ promise, context })
        } finally {
            logging?.[dispose]()
        }

        promise.then(
            result => {
                let val = { result, context }
                let logging = startLogging('⚡✔ (async resolved)', e.displayName, [val], () => ({ Promise: promise })) // NOCOMMIT Container
                try {
                    e.emit(val)
                } finally {
                    logging?.[dispose]()
                }
            },
            error => {
                let val = { error, context }
                let logging = startLogging('⚡✘ (async rejected)', e.displayName, [val], () => ({ Promise: promise })) // NOCOMMIT Container
                try {
                    e.emit(val)
                } finally {
                    logging?.[dispose]()
                }
            })

        return promise
    })

    return Object.assign(fn, {
        started: e.filter(v => 'promise' in v, `${e.displayName}.started`),
        resolved: e.filter(v => 'result' in v, `${e.displayName}.resolved`),
        rejected: e.filter(v => 'error' in v, `${e.displayName}.rejected`)
    })
}

/** Converts an event class into a callable function */
export function makeEventFunction<T, Args extends [any, ...any[]] = [T], Return = Args[0]>(event: Event<T>, eventFn: (...args: Args) => Return) {
    Object.setPrototypeOf(eventFn, event);
    eventFn.apply = Function.prototype.apply;
    eventFn.call = Function.prototype.call;
    return eventFn as IEvent<T, Args>;
}