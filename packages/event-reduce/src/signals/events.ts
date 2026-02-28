import { dispose, identity, nameOfCallback } from "../utils"
import { startLogging } from "./logging"
import { Source, SourceBase, SourceObserverBase } from "./signals"

export function event<T = void>(name?: string) {
    let e = new Event<T>(name ?? "(anonymous event)")
    return makeEventFunction(e, (value: T) => {
        let logging = startLogging('⚡ (event)', e.displayName, [value]) // NOCOMMIT Container
        try {
            e.emit(value)
        } finally {
            logging?.[dispose]()
        }
        return value
    })
}

export interface AsyncEventFn<Result, Context> extends EventFn<[PromiseLike<Result>, Context], AsyncValue<Result, Context>> {
    started: Source<AsyncStart<Result, Context>>
    resolved: Source<AsyncResult<Result, Context>>
    rejected: Source<AsyncError<Context>>
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

export function asyncEvent<T = void, Context = void>(name?: string): AsyncEventFn<T, Context> {
    let e = new Event<AsyncStart<T, Context> | AsyncResult<T, Context> | AsyncError<Context>>(name ?? "(anonymous async event)")
    let fn = makeEventFunction(e, <P extends PromiseLike<T>>(promise: P, context: Context) => {
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
        started: filter(e, v => 'promise' in v, `${e.displayName}.started`),
        resolved: filter(e, v => 'result' in v, `${e.displayName}.resolved`),
        rejected: filter(e, v => 'error' in v, `${e.displayName}.rejected`)
    })
}

/** Converts an event class into a callable function */
export function makeEventFunction<T, Args extends [any, ...any[]] = [T], Return = Args[0]>(event: Event<T>, eventFn: (...args: Args) => Return) {
    Object.setPrototypeOf(eventFn, event);
    eventFn.apply = Function.prototype.apply;
    eventFn.call = Function.prototype.call;
    return eventFn as EventFn<Args, T>;
}

type EventFn<Args extends [any, ...any[]], T = Args[0]> = ((...args: Args) => Args[0]) & Event<T>

class Event<T> extends SourceBase<T> {
    constructor(displayName: string) { super(displayName, () => false) }
    emit(value: T) { this.setValue(value, true) }
}

class BoundEvent<In, Out> extends SourceObserverBase<Out, In> {
    readonly sources = new Set<Source<In>>()

    constructor(
        displayName: string,
        source: Source<In>,
        private _transform = identity as (value: In) => Out,
        skipUpdate = (old: Out, next: Out) => false
    ) {
        super(displayName, skipUpdate)
        this.sources.add(source)
    }

    sourceUpdated<S extends In>(source: Source<S>, value: S): void {
        let newValue = this._transform(value)
        this.setValue(newValue)
    }
}

export function map<In, Out>(source: Source<In>, transform: (value: In) => Out, displayName = `${source.displayName}.map(${nameOfCallback(transform)})`): Source<Out> {
    return new BoundEvent(displayName, source, transform)
}

export function filter<In, Out extends In>(source: Source<In>, predicate: (value: In) => value is Out, displayName = `${source.displayName}.filter(${nameOfCallback(predicate)})`): Source<Out> {
    return new BoundEvent<In, Out>(displayName, source, identity as (value: In) => Out, (_, next) => !predicate(next))
}

export function filterMap<In, Out>(source: Source<In>, transform: (value: In) => Out | undefined, displayName = `${source.displayName}.filterMap(${nameOfCallback(transform)})`): Source<Out> {
    return new BoundEvent(displayName, source, transform, (_, next) => next == undefined)
}