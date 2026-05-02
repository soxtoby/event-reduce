import { startLogging } from "./logging"
import { type ISource, Source } from "./sources"
import { beginTransition } from "./tracking"
import { Scoped, SourceValue } from "./types"
import { dispose, matchesScope, nameOfCallback } from "./utils"

export interface IEvent<In, Out = In> extends IEventFunction<Out, [value: In]> {
    scope<Scope extends Partial<In>>(scope: Scope): IEvent<Scoped<In, Scope>, Out>
}

export interface IEventFunction<T, Args extends any[], Return = Args[0]> extends ISource<T> {
    (...args: Args): Return
}

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

export interface IAsyncSource<Result, Context> extends ISource<AsyncValue<Result, Context>> {
    started: ISource<AsyncStart<Result, Context>>
    resolved: ISource<AsyncResult<Result, Context>>
    rejected: ISource<AsyncError<Context>>

    filterContext<FilteredContext extends Context>(predicate: (context: Context) => context is FilteredContext, displayName?: string): IAsyncSource<Result, FilteredContext>
    filterContext(predicate: (context: Context) => boolean, displayName?: string): IAsyncSource<Result, Context>
}

export interface IAsyncEvent<Result, Context> extends IEventFunction<AsyncValue<Result, Context>, [promise: PromiseLike<Result>, context: Context]>, IAsyncSource<Result, Context> {
    scope<Scope extends Partial<Context>>(scope: Scope): IAsyncEvent<Result, Scoped<Context, Scope>>
}

export type AsyncValue<Result, Context = void> =
    | AsyncStart<Result, Context>
    | AsyncResult<Result, Context>
    | AsyncError<Context>

export interface AsyncStart<Result, Context = void> {
    type: 'start'
    context: Context
    promise: PromiseLike<Result>
}

export interface AsyncResult<Result, Context = void> {
    type: 'result'
    context: Context
    result: Result
}

export interface AsyncError<Context = void> {
    type: 'error'
    context: Context
    error: unknown
}

export function asyncEvent<Result = void, Context = void>(name: string = "(anonymous async event)"): IAsyncEvent<Result, Context> {
    return makeEventFunction(name, function asyncEvent<P extends PromiseLike<Result>>(
        this: IEventFunction<AsyncValue<Result, Context>, [promise: PromiseLike<Result>, context: Context]>,
        emit: (value: AsyncValue<Result, Context>) => void,
        promise: P,
        context: Context
    ) {
        let val = { type: 'start', promise, context } satisfies AsyncStart<Result, Context>
        let logging = startLogging('⚡⌚ (async event)', name, [val], () => ({ Path: this.path, Promise: promise }))
        try {
            emit(val)
        } finally {
            logging?.[dispose]()
        }

        promise.then(
            result => {
                let val = { type: 'result', result, context } satisfies AsyncResult<Result, Context>
                let logging = startLogging('⚡✔ (async resolved)', name, [val], () => ({ Path: this.path, Promise: promise }))
                try {
                    emit(val)
                } finally {
                    logging?.[dispose]()
                }
            },
            error => {
                let val = { type: 'error', error, context } satisfies AsyncError<Context>
                let logging = startLogging('⚡✘ (async rejected)', name, [val], () => ({ Path: this.path, Promise: promise }))
                try {
                    emit(val)
                } finally {
                    logging?.[dispose]()
                }
            })

        return promise
    }, function asyncEventMembers<CurrentContext>(e: IEventFunction<AsyncValue<Result, CurrentContext>, [promise: PromiseLike<Result>, context: CurrentContext]>) {
        return {
            ...asyncSourceMembers<Result, CurrentContext>(e),
            scope<Scope extends Partial<CurrentContext>>(scope: Scope): IAsyncEvent<Result, Scoped<CurrentContext, Scope>> {
                return bindEvent(e,
                    `${e.displayName}.scoped(${JSON.stringify(scope)})`,
                    (promise: PromiseLike<Result>, context: Scoped<CurrentContext, Scope>) => e(promise, { ...context, ...scope } as CurrentContext),
                    v => matchesScope(scope, v.context),
                    asyncEventMembers) as IAsyncEvent<Result, Scoped<CurrentContext, Scope>>
            }
        }
    }) as IAsyncEvent<Result, Context>
}

function asyncSourceMembers<Result, Context>(source: ISource<AsyncValue<Result, Context>>) {
    let setBaseDisplayName = source.setDisplayName

    return {
        started: source.filter(e => e.type == 'start', `${source.displayName}.started`),
        resolved: source.filter(e => e.type == 'result', `${source.displayName}.resolved`),
        rejected: source.filter(e => e.type == 'error', `${source.displayName}.rejected`),
        filterContext(predicate: (context: Context) => boolean, displayName = `${source.displayName}.filterContext(${nameOfCallback(predicate)})`) {
            let filtered = source.filter(e => predicate(e.context), displayName)
            return Object.assign(filtered, asyncSourceMembers(filtered))
        },
        setDisplayName(this: IAsyncSource<Result, Context>, name: string) {
            setBaseDisplayName.call(source, name)
            this.started.setDisplayName(`${name}.started`)
            this.resolved.setDisplayName(`${name}.resolved`)
            this.rejected.setDisplayName(`${name}.rejected`)
        }
    }
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

export type AdditionalMembersFactory<Source extends ISource<any>, Members extends object> =
    (source: Source & IEventFunction<SourceValue<Source>, any>) => Members

class Event<T> extends Source<T> {
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
