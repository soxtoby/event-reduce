import { beforeEach, describe, expect, test } from "bun:test";
import { asyncEvent, event, type AsyncError, type AsyncResult, type AsyncStart } from 'event-reduce/signals';
import { SideEffectDuringReactionError } from "event-reduce/signals/tracking";
import { MockObserver } from "./MockObserver";

describe("event", () => {
    type TestType = { foo: string, bar: number };
    let sut: ReturnType<typeof event<TestType>>;

    beforeEach(() => {
        sut = event<TestType>('sut');
    });

    describe("when subscribed to", () => {
        let subscriber: MockObserver<TestType>;

        beforeEach(() => {
            subscriber = new MockObserver()
            sut.subscribe(subscriber);
        });

        test("when called, passes value to subscribers", () => {
            let value = { foo: 'foo', bar: 1 };

            sut(value);

            expect(subscriber.sourceUpdated).toHaveBeenCalledWith(sut, value);
        });
    });

    test("when handler calls another event, throws", () => {
        let otherEvent = event<void>('otherEvent');
        let observer = new MockObserver()
        observer.sourceUpdated = () => otherEvent(undefined)
        sut.subscribe(observer);

        try {
            sut({ foo: 'foo', bar: 1 });
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(SideEffectDuringReactionError);
            expect((e as SideEffectDuringReactionError).reactingTo).toBe(sut);
            expect((e as SideEffectDuringReactionError).sideEffect).toBe(otherEvent);
        }
    });

    describe("scope", () => {
        let scoped: any;
        let rootObserver: MockObserver<TestType>;
        let scopedObserver: MockObserver<TestType>;

        beforeEach(() => {
            scoped = sut.scope({ foo: 'foo' });
            rootObserver = new MockObserver()
            scopedObserver = new MockObserver()
            sut.subscribe(rootObserver);
            scoped.subscribe(scopedObserver);
        });

        test("when non-matching value passed to parent event, scoped event does not pass on value", () => {
            sut({ foo: 'bar', bar: 1 });

            expect(scopedObserver.sourceUpdated).not.toHaveBeenCalled();
        });

        test("when matching value passed to parent event, scoped event passed on value", () => {
            let value = { foo: 'foo', bar: 1 };

            sut(value);

            expect(scopedObserver.sourceUpdated).toHaveBeenCalledWith(scoped, value);
        });

        test("when called with partial value, scoped event fills in scope values", () => {
            scoped({ bar: 2 });

            expect(rootObserver.sourceUpdated).toHaveBeenCalledWith(sut, expect.objectContaining({ foo: 'foo', bar: 2 }));
            expect(scopedObserver.sourceUpdated).toHaveBeenCalledWith(scoped, expect.objectContaining({ foo: 'foo', bar: 2 }));
        });
    });
});

describe("asyncEvent", () => {
    type Result = { foo: string; };
    type Context = { bar: string; };
    let sut: ReturnType<typeof asyncEvent<Result, Context>>;

    let started: MockObserver<AsyncStart<Result, Context>>;
    let resolved: MockObserver<AsyncResult<Result, Context>>;
    let rejected: MockObserver<AsyncError<Context>>;

    beforeEach(() => {
        sut = asyncEvent<Result, Context>();
        started = new MockObserver()
        resolved = new MockObserver()
        rejected = new MockObserver()
        sut.started.subscribe(started);
        sut.resolved.subscribe(resolved);
        sut.rejected.subscribe(rejected);
    });

    describe("when called", () => {
        let promise: Promise<Result>;
        let resolve: (value: Result) => void;
        let reject: (error: any) => void;
        let context: Context;

        beforeEach(() => {
            ({ promise, resolve, reject } = Promise.withResolvers<Result>());
            context = { bar: 'context' };
            sut(promise, context);
        });

        test("started event fired", () => expect(started.sourceUpdated).toHaveBeenCalledWith(sut.started, expect.objectContaining({ promise, context })));

        test("when promise resolved, resolved event fired", async () => {
            let result = { foo: 'result' };
            resolve(result);
            await promise;

            expect(resolved.sourceUpdated).toHaveBeenCalledWith(sut.resolved, expect.objectContaining({ result, context }));
        });

        test("when promise rejected, rejected event fired", async () => {
            let error = { message: 'error' };
            reject(error);
            await promise.catch(() => { }); // Catch to prevent unhandled rejection

            expect(rejected.sourceUpdated).toHaveBeenCalledWith(sut.rejected, expect.objectContaining({ error, context }));
        });
    });
});
