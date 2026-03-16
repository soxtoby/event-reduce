import { Scoped } from "../types"
import { dispose, matchesScope } from "../utils"
import { startLogging } from "./logging"
import { type ISource, SourceBase, SourceValue } from "./signals"
import { beginTransition } from "./tracking"

export interface IEventFunction<T, Args extends any[], Return = Args[0]> extends ISource<T> {
    (...args: Args): Return
}

export interface IEvent<In, Out = In> extends IEventFunction<Out, [value: In]> {
    scope<Scope extends Partial<In>>(scope: Scope): IEvent<Scoped<In, Scope>, Out>
}

export type AdditionalMembersFactory<Source extends ISource<any>, Members extends object> =
    (source: Source & IEventFunction<SourceValue<Source>, any>) => Members

export function event<T = void>(name: string = "(anonymous event)"): IEvent<T> {
    return makeEventFunction(name, function event(emit: (value: T) => void, value: T) {
        let logging = startLogging('⚡ (event)', name, [value], () => ({ Path: this.path }))
        try {
            emit(value)
        } finally {
            logging?.[dispose]()
        }
        return value
    }, function eventMembers<In>(e: IEventFunction<T, [In]>) {
        return {
            scope<Scope extends Partial<In>>(scope: Scope): IEvent<Scoped<In, Scope>, T> {
                return bindEvent(e,
                    `${e.displayName}.scoped(${JSON.stringify(scope)})`,
                    (value: Scoped<In, Scope>) => e({ ...value, ...scope } as In),
                    matchesScope(scope),
                    eventMembers) as IEvent<Scoped<In, Scope>, T>
            }
        }
    }) as IEvent<T>
}

export interface IAsyncEvent<Result, Context> extends IEventFunction<AsyncValue<Result, Context>, [promise: PromiseLike<Result>, context: Context]> {
    started: ISource<AsyncStart<Result, Context>>
    resolved: ISource<AsyncResult<Result, Context>>
    rejected: ISource<AsyncError<Context>>
    scope<Scope extends Partial<Context>>(scope: Scope): IAsyncEvent<Result, Scoped<Context, Scope>>
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
    return makeEventFunction(name, function asyncEvent<P extends PromiseLike<Result>>(
        this: IEventFunction<AsyncValue<Result, Context>, [promise: PromiseLike<Result>, context: Context]>,
        emit: (value: AsyncValue<Result, Context>) => void,
        promise: P,
        context: Context
    ) {
        let logging = startLogging('⚡⌚ (async event)', name, [promise, context], () => ({ Path: this.path, Promise: promise }))
        try {
            emit({ promise, context })
        } finally {
            logging?.[dispose]()
        }

        promise.then(
            result => {
                let val = { result, context }
                let logging = startLogging('⚡✔ (async resolved)', name, [val], () => ({ Path: this.path, Promise: promise }))
                try {
                    emit(val)
                } finally {
                    logging?.[dispose]()
                }
            },
            error => {
                let val = { error, context }
                let logging = startLogging('⚡✘ (async rejected)', name, [val], () => ({ Path: this.path, Promise: promise }))
                try {
                    emit(val)
                } finally {
                    logging?.[dispose]()
                }
            })

        return promise
    }, function asyncEventMembers(e: IEventFunction<AsyncValue<Result, Context>, [promise: PromiseLike<Result>, context: Context]>) {
        let setBaseDisplayName = e.setDisplayName
        return {
            started: e.filter(v => 'promise' in v, `${e.displayName}.started`),
            resolved: e.filter(v => 'result' in v, `${e.displayName}.resolved`),
            rejected: e.filter(v => 'error' in v, `${e.displayName}.rejected`),
            scope<Scope extends Partial<Context>>(scope: Scope) {
                return bindEvent(e,
                    `${e.displayName}.scoped(${JSON.stringify(scope)})`,
                    (promise: PromiseLike<Result>, context: Scoped<Context, Scope>) => e(promise, { ...context, ...scope } as Context),
                    v => matchesScope(scope, v.context),
                    asyncEventMembers)
            },
            setDisplayName(name: string) {
                setBaseDisplayName.call(e, name)
                this.started.setDisplayName(`${name}.started`)
                this.resolved.setDisplayName(`${name}.resolved`)
                this.rejected.setDisplayName(`${name}.rejected`)
            }
        }
    }) as IAsyncEvent<Result, Context>
}

/** Creates a callable event object. */
export function makeEventFunction<T, Args extends any[] = [T], Return = Args[0], Members extends object = {}>(
    name: string,
    fire: (this: IEventFunction<T, Args, Return>, emit: (value: T) => void, ...args: Args) => Return,
    getMembers?: AdditionalMembersFactory<ISource<any>, Members>
): IEventFunction<T, Args, Return> & Members {
    let eventSource = new Event<T>(name) as Event<T> & IEventFunction<T, Args, Return>
    return makeSourceFunction(eventSource, event, getMembers)

    function event(...args: Args) { return fire.call(event as IEventFunction<T, Args, Return>, eventSource.emit.bind(event), ...args) }
}

/** Wrap an event with input and output filter. Useful for scoping. */
export function bindEvent<E extends IEventFunction<any, any>, Args extends any[], Return, Members extends object>(
    event: E,
    displayName: string,
    fire: (...args: Args) => Return,
    predicate: (value: SourceValue<E>) => boolean,
    getMembers?: AdditionalMembersFactory<ISource<any>, Members>
) {
    return makeSourceFunction(event.filter(predicate, displayName), fire, getMembers)
}

function makeSourceFunction<Source extends ISource<any>, Args extends any[], Return, Members extends object>(
    innerEvent: Source,
    fire: (...args: Args) => Return,
    getMembers?: AdditionalMembersFactory<Source, Members>
): IEventFunction<SourceValue<Source>, Args, Return> & Members {
    let eventFn = fire as Source & IEventFunction<SourceValue<Source>, Args, Return>
    Object.setPrototypeOf(eventFn, innerEvent);
    eventFn.apply = Function.prototype.apply;
    eventFn.call = Function.prototype.call;
    return getMembers
        ? Object.assign(eventFn, getMembers(eventFn))
        : eventFn as Source & IEventFunction<SourceValue<Source>, Args, Return> & Members
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
    override isValidAsState = false
    override skipUpdate(nextValue: T) { return false }
    protected override updateChildren(previousValue: T, nextValue: T) { } // Value won't be held onto
}

export function isEvent(value: any): value is IEventFunction<unknown, unknown[], unknown> {
    return typeof value == 'function'
        && value instanceof Event
}