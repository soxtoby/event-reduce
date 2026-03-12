import { dispose, nameOfCallback } from "../utils"
import { startLogging } from "./logging"
import { applyScope, DeepPartial, matchesScope, Scoped } from "./scoping"
import { type ISource, SourceBase } from "./signals"
import { beginTransition } from "./tracking"

export interface IEventBase<T, Args extends any[]> extends ISource<T> {
    (...args: Args): Args[0]
    map<Out>(transform: (value: T) => Out, displayName?: string): ISource<Out>
    filter<Out extends T>(predicate: (value: T) => value is Out, displayName?: string): ISource<Out>
    filterMap<Out>(transform: (value: T) => Out | undefined, displayName?: string): ISource<Out>
}

export interface IEvent<In, Out = In> extends IEventBase<Out, [value: In]> {
    scope<Scope extends DeepPartial<In>>(scope: Scope): IEvent<Out, [value: Scoped<In, Scope>]>
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
            return Event.bindEvent(e, `${e.displayName}.scoped(${JSON.stringify(scope)})`,
                (value: Scoped<T, Scope>) => e(applyScope(value, scope)),
                value => matchesScope(value, scope)) as any as IEvent<T, [value: Scoped<T, Scope>]>
        }
    }))
}

export interface IAsyncEvent<Result, Context> extends IEventBase<AsyncValue<Result, Context>, [promise: PromiseLike<Result>, context: Context]> {
    started: ISource<AsyncStart<Result, Context>>
    resolved: ISource<AsyncResult<Result, Context>>
    rejected: ISource<AsyncError<Context>>
    scope<Scope extends DeepPartial<Context>>(scope: Scope): IAsyncEvent<Result, Scoped<Context, Scope>>
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
            return Event.bindEvent(e, `${e.displayName}.scoped(${JSON.stringify(scope)})`,
                (promise: PromiseLike<Result>, context: Scoped<Context, Scope>) => e(promise, applyScope(context, scope)),
                value => matchesScope(value.context, scope)) as IAsyncEvent<Result, Scoped<Context, Scope>>
        }
    }))
}

/** Converts an event class into a callable function */
export function makeEventFunction<T, Args extends any[] = [T], Return = Args[0], Members extends object = {}>(
    name: string,
    fire: (emit: (event: T) => void, ...args: Args) => Return,
    getMembers?: (event: IEventBase<T, Args>) => Members
): IEventBase<T, Args> & Members {
    let eventBase = new Event<T>(name)
    let eventFn = event as Event<T> & IEventBase<T, Args>
    Object.setPrototypeOf(eventFn, eventBase);
    eventFn.apply = Function.prototype.apply;
    eventFn.call = Function.prototype.call;
    return Object.assign(eventFn, getMembers?.(eventFn) ?? {} as Members)

    function event(...args: Args) { return fire(eventFn.emit.bind(eventFn), ...args) }
}

class Event<T> extends SourceBase<T> {
    emit(value: T) {
        let transition = beginTransition(this, true)
        try {
            this.setValue(value)
        } finally {
            this._value = undefined! // Events shouldn't hold on to their values
            transition[dispose]()
        }
    }
    override isValidState = false
    override skipUpdate(nextValue: T) { return false }
    protected override updateChildren(previousValue: T, nextValue: T) { } // Value won't be held onto

    override map<Out>(transform: (value: T) => Out, displayName = `${this.displayName}.map(${nameOfCallback(transform)})`): ISource<Out> {
        // Mapped events should always trigger, even if the value is the same
        return SourceBase.bind(this, v => transform(v), () => false, `${displayName}.map(${nameOfCallback(transform)})`)
    }

    /** 
     * Transforms an event by wrapping the function, and filtering the emitted values. 
     * Useful for scope functions.
    */
    static bindEvent<E extends IEventBase<any, any>, ScopedArgs extends any[]>(
        baseEvent: E,
        displayName: string,
        scopedFn: (...args: ScopedArgs) => ReturnType<E>,
        eventPredicate: (value: EventValue<E>) => boolean
    ): IEventBase<EventValue<E>, ScopedArgs> {
        let scopedEvent = scopedFn as IEventBase<EventValue<E>, ScopedArgs>
        Object.setPrototypeOf(scopedEvent, Object.create(baseEvent, {
            skipUpdate: { value: (next: EventValue<E>) => (baseEvent as any).skipUpdate(next) || !eventPredicate(next) }
        }));
        scopedEvent.displayName = displayName
        return scopedEvent
    }
}

export function isEvent(value: any): value is IEventBase<unknown, unknown[]> {
    return typeof value == 'function'
        && value instanceof Event
}

type EventValue<Event extends IEventBase<any, any>> = Event extends IEventBase<infer T, any> ? T : never