import { startLogging } from "./logging"
import { type ISource, Source } from "./sources"
import { beginTransition } from "./tracking"
import { Scoped, SourceValue } from "./types"
import { dispose, matchesScope, nameOfCallback } from "./utils"

export function event<T = void>(name: string = "(anonymous event)"): IEvent<T> {
    return makeEvent({
        name,
        fire(emit: (value: T) => void, value: T) {
            let logging = startLogging('⚡ (event)', name, [value], () => ({ Path: this.path }))
            try {
                emit(value)
            } finally {
                logging?.[dispose]()
            }
            return value
        },
        additionalMembers: <In>(e: IEventFunction<T, [In]>) => ({
            scope<Scope extends Partial<In>>(scope: Scope): IEvent<Scoped<In, Scope>, T> {
                return bindEvent(e,
                    `${e.displayName}.scoped(${JSON.stringify(scope)})`,
                    (value: Scoped<In, Scope>) => e({ ...value, ...scope } as In),
                    matchesScope(scope)) as IEvent<Scoped<In, Scope>, T>
            }
        })
    }) as IEvent<T>
}

export function asyncEvent<Result = void, Context = void>(name: string = "(anonymous async event)"): IAsyncEvent<Result, Context> {
    return makePhasedEvent({
        name,
        phases: ['started', 'resolved', 'rejected'],
        fire<P extends PromiseLike<Result>>(
            emit: (value: AsyncValue<Result, Context>) => void,
            promise: P,
            context: Context
        ) {
            let val = { phase: 'started', promise, context } satisfies AsyncStart<Result, Context>
            let logging = startLogging('⚡⌚ (async event)', name, [val], () => ({ Path: this.path, Promise: promise }))
            try {
                emit(val)
            } finally {
                logging?.[dispose]()
            }

            promise.then(
                result => {
                    let val = { phase: 'resolved', result, context } satisfies AsyncResult<Result, Context>
                    let logging = startLogging('⚡✔ (async resolved)', name, [val], () => ({ Path: this.path, Promise: promise }))
                    try {
                        emit(val)
                    } finally {
                        logging?.[dispose]()
                    }
                },
                error => {
                    let val = { phase: 'rejected', error, context } satisfies AsyncError<Context>
                    let logging = startLogging('⚡✘ (async rejected)', name, [val], () => ({ Path: this.path, Promise: promise }))
                    try {
                        emit(val)
                    } finally {
                        logging?.[dispose]()
                    }
                })

            return promise
        }
    }) as IAsyncEvent<Result, Context>
}

/**
 * Creates a callable event with named phase sources.
 *
 * Use this to build custom async-style events, such as observable or stream events. The `fire`
 * callback receives an `emit` function; emit values must include a `phase` matching one of
 * `phases` and a `context` matching the last argument passed to the event. The returned event
 * exposes a source for each phase, plus `filterContext` and `scope`.
 */
export function makePhasedEvent<
    const Phases extends readonly string[],
    Args extends any[],
    Return,
    Value extends { phase: Phases[number], context: ContextArg<Args> }
>(
    {
        name,
        phases,
        fire
    }: {
        name: string,
        phases: Phases,
        fire: (emit: (value: Value) => void, ...args: Args) => Return
    } & ThisType<ISource<Value>>
): IPhasedEvent<Value, Args, Return> {
    return makeEvent({
        name,
        fire,
        additionalMembers: <CurrentContext>(e: IEventFunction<NarrowContext<Value, CurrentContext>, ScopedArgs<Args, CurrentContext>, Return>) => ({
            ...phasedSourceMembers<NarrowContext<Value, CurrentContext>, CurrentContext>(
                e as unknown as ISource<NarrowContext<Value, CurrentContext>>,
                phases as readonly (NarrowContext<Value, CurrentContext>['phase'] & string)[]
            ),
            scope<Scope extends CurrentContext extends object ? Partial<CurrentContext> : never>(scope: Scope): IPhasedEvent<NarrowContext<Value, CurrentContext & Scope>, ScopedArgs<Args, Scoped<CurrentContext, Scope>>, Return, CurrentContext & Scope> {
                return bindEvent(e,
                    `${e.displayName}.scoped(${JSON.stringify(scope)})`,
                    (...args: ScopedArgs<Args, Scoped<CurrentContext, Scope>>) => {
                        let argsWithScope = args.slice()
                        argsWithScope[argsWithScope.length - 1] = { ...argsWithScope[argsWithScope.length - 1], ...scope }
                        return e(...argsWithScope as ScopedArgs<Args, CurrentContext>)
                    },
                    v => matchesScope(scope, v.context),
                ) as unknown as IPhasedEvent<NarrowContext<Value, CurrentContext & Scope>, ScopedArgs<Args, Scoped<CurrentContext, Scope>>, Return, CurrentContext & Scope>
            }
        })
    }) as IPhasedEvent<Value, Args, Return>
}

/** Creates a callable event object. */
export function makeEvent<T, Args extends any[] = [T], Return = Args[0], Members extends object = {}>(
    {
        name,
        fire,
        additionalMembers
    }: {
        name: string,
        fire: (this: IEventFunction<T, Args, Return>, emit: (value: T) => void, ...args: Args) => Return,
        additionalMembers?: AdditionalMembersFactory<ISource<any>, Members>
    } & ThisType<IEventFunction<T, Args, Return>>
): IEventFunction<T, Args, Return> & Members {
    let eventSource = new Event<T>(name) as Event<T> & IEventFunction<T, Args, Return>
    return makeSourceFunction(eventSource, event, additionalMembers)

    function event(...args: Args) { return fire.call(event as IEventFunction<T, Args, Return>, eventSource.emit.bind(event), ...args) }
}

/** Wrap an event with input and output filter. Useful for scoping. */
export function bindEvent<E extends IEventFunction<any, any>, Args extends any[], Return>(
    event: E,
    displayName: string,
    fire: (...args: Args) => Return,
    predicate: (value: SourceValue<E>) => boolean
) {
    return makeSourceFunction(event.filter(predicate, displayName), fire, (event as EventWithAdditionalMembers)[membersFactory])
}

function phasedSourceMembers<Value extends { phase: string, context: Context }, Context>(source: ISource<Value>, phases: readonly (Value['phase'] & string)[]) {
    let setBaseDisplayName = source.setDisplayName
    let phaseMembers = Object.fromEntries(phases.map(phase => [
        phase,
        source.filter(e => e.phase == phase, `${source.displayName}.${phase}`)
    ]))

    return {
        ...phaseMembers,
        filterContext(predicate: (context: Context) => boolean, displayName = `${source.displayName}.filterContext(${nameOfCallback(predicate)})`) {
            let filtered = source.filter(e => predicate(e.context), displayName)
            return Object.assign(filtered, phasedSourceMembers(filtered, phases))
        },
        setDisplayName(this: IPhasedSource<Value, Context>, name: string) {
            setBaseDisplayName.call(source, name)
            for (let phase of phases)
                this[phase].setDisplayName(`${name}.${phase}`)
        }
    }
}

function makeSourceFunction<Source extends ISource<any>, Args extends any[], Return, Members extends object>(
    innerEvent: Source,
    fire: (...args: Args) => Return,
    additionalMembers?: AdditionalMembersFactory<Source, Members>
): IEventFunction<SourceValue<Source>, Args, Return> & Members {
    let eventFn = fire as Source & IEventFunction<SourceValue<Source>, Args, Return>
    Object.setPrototypeOf(eventFn, innerEvent);
    eventFn.apply = Function.prototype.apply;
    eventFn.call = Function.prototype.call;
    return additionalMembers
        ? Object.assign(eventFn, additionalMembers(eventFn), { [membersFactory]: additionalMembers as AdditionalMembersFactory<ISource<any>, any> })
        : eventFn as Source & IEventFunction<SourceValue<Source>, Args, Return> & Members
}

export function isEvent(value: any): value is IEventFunction<unknown, unknown[], unknown> {
    return typeof value == 'function'
        && value instanceof Event
}

export interface IEvent<In, Out = In> extends IEventFunction<Out, [value: In]> {
    scope<Scope extends Partial<In>>(scope: Scope): IEvent<Scoped<In, Scope>, Out>
}

export interface IEventFunction<T, Args extends any[], Return = Args[0]> extends ISource<T> {
    (...args: Args): Return
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
    phase: 'started'
    context: Context
    promise: PromiseLike<Result>
}

export interface AsyncResult<Result, Context = void> {
    phase: 'resolved'
    context: Context
    result: Result
}

export interface AsyncError<Context = void> {
    phase: 'rejected'
    context: Context
    error: unknown
}

export type IPhasedSource<Value extends { phase: string, context: any }, Context> =
    ISource<Value>
    & { [Phase in Value['phase'] & string]: ISource<Extract<Value, { phase: Phase }>> }
    & {
        filterContext<FilteredContext extends Context>(predicate: (context: Context) => context is FilteredContext, displayName?: string): IPhasedSource<NarrowContext<Value, FilteredContext>, FilteredContext>
        filterContext(predicate: (context: Context) => boolean, displayName?: string): IPhasedSource<Value, Context>
    }

export type IPhasedEvent<Value extends { phase: string, context: any }, Args extends any[], Return, Context = ContextArg<Args>> =
    IEventFunction<Value, Args, Return>
    & IPhasedSource<Value, Context>
    & {
        scope<Scope extends Context extends object ? Partial<Context> : never>(
            scope: Scope
        ): IPhasedEvent<NarrowContext<Value, Context & Scope>, ScopedArgs<Args, Scoped<Context, Scope>>, Return, Context & Scope>
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

const membersFactory = Symbol('event members factory')

type ContextArg<Args extends any[]> = Args extends [...any[], infer Ctx] ? Ctx : never
type NarrowContext<Value, Context> = Value & { context: Context }
type ScopedArgs<Args extends any[], Context> =
    Args extends [...infer Rest, any]
    ? [...Rest, Context]
    : never

type EventWithAdditionalMembers = { [membersFactory]?: AdditionalMembersFactory<ISource<any>, any> }
