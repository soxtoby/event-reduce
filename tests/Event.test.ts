import { beforeEach, describe, expect, test } from "bun:test"
import { asyncEvent, event, type AsyncError, type AsyncResult, type AsyncStart, type IAsyncObservable } from 'event-reduce'
import { makePhasedEvent, type IPhasedObservable } from "event-reduce/lib/events"
import { SideEffectDuringReactionError } from "event-reduce/lib/tracking"
import { MockObserver } from "./MockObserver"

describe("event", () => {
    type TestType = { foo: string, bar: number }
    let sut: ReturnType<typeof event<TestType>>

    beforeEach(() => {
        sut = event<TestType>('sut')
    })

    describe("when subscribed to", () => {
        let subscriber: MockObserver<TestType>

        beforeEach(() => {
            subscriber = new MockObserver()
            sut.subscribe(subscriber)
        })

        test("when called, passes value to subscribers", () => {
            let value = { foo: 'foo', bar: 1 }

            sut(value)

            expect(subscriber.sourceUpdated).toHaveBeenCalledWith(sut, value)
        })
    })

    test("when handler calls another event, throws", () => {
        let otherEvent = event<void>('otherEvent')
        let observer = new MockObserver()
        observer.sourceUpdated = () => otherEvent(undefined)
        sut.subscribe(observer)

        try {
            sut({ foo: 'foo', bar: 1 })
            expect.unreachable("Should have thrown")
        } catch (e) {
            expect(e).toBeInstanceOf(SideEffectDuringReactionError)
            expect((e as SideEffectDuringReactionError).reactingTo).toBe(sut)
            expect((e as SideEffectDuringReactionError).sideEffect).toBe(otherEvent)
        }
    })

    describe("scope", () => {
        let scoped: any
        let rootObserver: MockObserver<TestType>
        let scopedObserver: MockObserver<TestType>

        beforeEach(() => {
            scoped = sut.scope({ foo: 'foo' })
            rootObserver = new MockObserver()
            scopedObserver = new MockObserver()
            sut.subscribe(rootObserver)
            scoped.subscribe(scopedObserver)
        })

        test("when non-matching value passed to parent event, scoped event does not pass on value", () => {
            sut({ foo: 'bar', bar: 1 })

            expect(scopedObserver.sourceUpdated).not.toHaveBeenCalled()
        })

        test("when matching value passed to parent event, scoped event passed on value", () => {
            let value = { foo: 'foo', bar: 1 }

            sut(value)

            expect(scopedObserver.sourceUpdated).toHaveBeenCalledWith(scoped, value)
        })

        test("when called with partial value, scoped event fills in scope values", () => {
            scoped({ bar: 2 })

            expect(rootObserver.sourceUpdated).toHaveBeenCalledWith(sut, expect.objectContaining({ foo: 'foo', bar: 2 }))
            expect(scopedObserver.sourceUpdated).toHaveBeenCalledWith(scoped, expect.objectContaining({ foo: 'foo', bar: 2 }))
        })
    })
})

describe("asyncEvent", () => {
    type Result = { foo: string }
    type Context = { bar: string }
    let sut: ReturnType<typeof asyncEvent<Result, Context>>

    let started: MockObserver<AsyncStart<Result, Context>>
    let resolved: MockObserver<AsyncResult<Result, Context>>
    let rejected: MockObserver<AsyncError<Context>>

    beforeEach(() => {
        sut = asyncEvent<Result, Context>()
        started = new MockObserver()
        resolved = new MockObserver()
        rejected = new MockObserver()
        sut.started.subscribe(started)
        sut.resolved.subscribe(resolved)
        sut.rejected.subscribe(rejected)
    })

    describe("when called", () => {
        let promise: Promise<Result>
        let resolve: (value: Result) => void
        let reject: (error: any) => void
        let context: Context

        beforeEach(() => {
            ({ promise, resolve, reject } = Promise.withResolvers<Result>())
            context = { bar: 'context' }
            sut(promise, context)
        })

        test("started event fired", () => expect(started.sourceUpdated).toHaveBeenCalledWith(sut.started, expect.objectContaining({ phase: 'started', promise, context })))

        test("when promise resolved, resolved event fired", async () => {
            let result = { foo: 'result' }
            resolve(result)
            await promise

            expect(resolved.sourceUpdated).toHaveBeenCalledWith(sut.resolved, expect.objectContaining({ phase: 'resolved', result, context }))
        })

        test("when promise rejected, rejected event fired", async () => {
            let error = { message: 'error' }
            reject(error)
            await promise.catch(() => { }) // Catch to prevent unhandled rejection

            expect(rejected.sourceUpdated).toHaveBeenCalledWith(sut.rejected, expect.objectContaining({ phase: 'rejected', error, context }))
        })
    })

    describe("filterContext", () => {
        let filtered: IAsyncObservable<Result, Context>
        let filteredStarted: MockObserver<AsyncStart<Result, Context>>
        let filteredResolved: MockObserver<AsyncResult<Result, Context>>
        let filteredRejected: MockObserver<AsyncError<Context>>

        beforeEach(() => {
            filtered = sut.filterContext(context => context.bar == 'match')
            filteredStarted = new MockObserver()
            filteredResolved = new MockObserver()
            filteredRejected = new MockObserver()
            filtered.started.subscribe(filteredStarted)
            filtered.resolved.subscribe(filteredResolved)
            filtered.rejected.subscribe(filteredRejected)
        })

        test("when context matches, filters all async event phases through", async () => {
            let resolved = Promise.resolve({ foo: 'result' })
            let rejected = Promise.reject({ message: 'error' })
            rejected.catch(() => { }) // Catch to prevent unhandled rejection

            sut(resolved, { bar: 'match' })
            sut(rejected, { bar: 'match' })
            await resolved
            await rejected.catch(() => { })

            expect(filteredStarted.sourceUpdated).toHaveBeenCalledWith(filtered.started, expect.objectContaining({ phase: 'started', context: { bar: 'match' } }))
            expect(filteredResolved.sourceUpdated).toHaveBeenCalledWith(filtered.resolved, expect.objectContaining({ phase: 'resolved', result: { foo: 'result' }, context: { bar: 'match' } }))
            expect(filteredRejected.sourceUpdated).toHaveBeenCalledWith(filtered.rejected, expect.objectContaining({ phase: 'rejected', error: { message: 'error' }, context: { bar: 'match' } }))
        })

        test("when context does not match, filters all async event phases out", async () => {
            let resolved = Promise.resolve({ foo: 'result' })
            let rejected = Promise.reject({ message: 'error' })
            rejected.catch(() => { }) // Catch to prevent unhandled rejection

            sut(resolved, { bar: 'other' })
            sut(rejected, { bar: 'other' })
            await resolved
            await rejected.catch(() => { })

            expect(filteredStarted.sourceUpdated).not.toHaveBeenCalled()
            expect(filteredResolved.sourceUpdated).not.toHaveBeenCalled()
            expect(filteredRejected.sourceUpdated).not.toHaveBeenCalled()
        })

        test("can chain context filters", async () => {
            let chained = sut
                .filterContext(context => context.bar.length > 1)
                .filterContext(context => context.bar == 'match')
            let observed = new MockObserver<AsyncResult<Result, Context>>()
            chained.resolved.subscribe(observed)

            let resolved = Promise.resolve({ foo: 'result' })
            sut(resolved, { bar: 'match' })
            await resolved

            expect(observed.sourceUpdated).toHaveBeenCalledWith(chained.resolved, expect.objectContaining({ phase: 'resolved', result: { foo: 'result' }, context: { bar: 'match' } }))
        })

        test("sets display names for filtered async observables and their phases", () => {
            let filtered = sut.filterContext(context => context.bar == 'match', 'matching')

            expect(filtered.displayName).toBe('matching')
            expect(filtered.started.displayName).toBe('matching.started')
            expect(filtered.resolved.displayName).toBe('matching.resolved')
            expect(filtered.rejected.displayName).toBe('matching.rejected')
        })

        test("supports context type guards", () => {
            type MixedContext =
                | { kind: 'matching'; bar: string }
                | { kind: 'other'; baz: string }

            let mixed = asyncEvent<Result, MixedContext>()
            let matching = mixed.filterContext((context): context is Extract<MixedContext, { kind: 'matching' }> => context.kind == 'matching')
            let expected: IAsyncObservable<Result, { kind: 'matching'; bar: string }> = matching

            expected.resolved.subscribe(new MockObserver<AsyncResult<Result, { kind: 'matching'; bar: string }>>())
        })
    })
})

describe("makePhasedEvent", () => {
    type Context = { id: string, group: string }
    type Value =
        | { phase: 'started', input: string, context: Context }
        | { phase: 'next', value: string, context: Context }
        | { phase: 'completed', context: Context }

    function testPhasedEvent(name = 'test phased') {
        return makePhasedEvent({
            name,
            phases: ['started', 'next', 'completed'],
            fire(emit: (value: Value) => void, input: string, context: Context) {
                emit({ phase: 'started', input, context })
                return () => {
                    emit({ phase: 'next', value: input.toUpperCase(), context })
                    emit({ phase: 'completed', context })
                }
            }
        })
    }

    test("adds phase discriminator and exposes phase observables", () => {
        let sut = testPhasedEvent()
        let all = new MockObserver()
        let started = new MockObserver()
        let next = new MockObserver()
        sut.subscribe(all)
        sut.started.subscribe(started)
        sut.next.subscribe(next)

        let flush: () => void = sut('value', { id: '1', group: 'a' })
        flush()

        expect(started.sourceUpdated).toHaveBeenCalledWith(sut.started, expect.objectContaining({ phase: 'started', input: 'value' }))
        expect(next.sourceUpdated).toHaveBeenCalledWith(sut.next, expect.objectContaining({ phase: 'next', value: 'VALUE' }))
        expect(all.sourceUpdated).toHaveBeenCalledWith(sut, expect.objectContaining({ phase: 'completed', context: { id: '1', group: 'a' } }))
    })

    test("filters all phases by context", () => {
        let sut = testPhasedEvent()
        let filtered = sut.filterContext(context => context.group == 'a')
        let next = new MockObserver()
        filtered.next.subscribe(next)

        sut('skip', { id: '1', group: 'b' })()
        sut('keep', { id: '2', group: 'a' })()

        expect(next.sourceUpdated).toHaveBeenCalledTimes(1)
        expect(next.sourceUpdated).toHaveBeenCalledWith(filtered.next, expect.objectContaining({ phase: 'next', value: 'KEEP', context: { id: '2', group: 'a' } }))
    })

    test("scopes context by merging into last argument", () => {
        let sut = testPhasedEvent()
        let scoped = sut.scope({ id: 'scoped' })
        let expectedScopedSource: IPhasedObservable<Value & { context: Context & { id: string } }, Context & { id: string }> = scoped
        let root = new MockObserver()
        let scopedNext = new MockObserver()
        sut.subscribe(root)
        expectedScopedSource.next.subscribe(scopedNext)

        scoped('value', { group: 'a' })

        expect(root.sourceUpdated).toHaveBeenCalledWith(sut, expect.objectContaining({ phase: 'started', context: { id: 'scoped', group: 'a' } }))
        expect(scopedNext.sourceUpdated).not.toHaveBeenCalled()

        sut('other', { id: 'scoped', group: 'a' })()

        expect(scopedNext.sourceUpdated).toHaveBeenCalledWith(scoped.next, expect.objectContaining({ phase: 'next', context: { id: 'scoped', group: 'a' } }))
    })

    test("sets display names for phases", () => {
        let sut = testPhasedEvent('custom')

        expect(sut.started.displayName).toBe('custom.started')
        expect(sut.next.displayName).toBe('custom.next')
        expect(sut.completed.displayName).toBe('custom.completed')

        sut.setDisplayName('renamed')

        expect(sut.started.displayName).toBe('renamed.started')
        expect(sut.next.displayName).toBe('renamed.next')
        expect(sut.completed.displayName).toBe('renamed.completed')
    })

    test("supports context type guards", () => {
        type MixedContext =
            | { kind: 'matching'; id: string }
            | { kind: 'other'; id: string }
        type MixedValue = { phase: 'next', value: string, context: MixedContext }

        let sut = makePhasedEvent({
            name: 'mixed',
            phases: ['next'],
            fire: (emit: (value: MixedValue) => void, value: string, context: MixedContext) => emit({ phase: 'next', value, context })
        })
        let matching = sut.filterContext((context): context is Extract<MixedContext, { kind: 'matching' }> => context.kind == 'matching')
        let expected: IPhasedObservable<{ phase: 'next', value: string, context: { kind: 'matching'; id: string } }, { kind: 'matching'; id: string }> = matching

        expected.next.subscribe(new MockObserver())
    })
})
