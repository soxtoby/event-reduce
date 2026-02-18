import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { asyncEvent, event, type AsyncError, type AsyncResult, type AsyncStart } from 'event-reduce';
import { ChainedEventsError } from "event-reduce/lib/events";

describe("event", () => {
    type TestType = { foo: string, bar: number };
    let sut: ReturnType<typeof event<TestType>>;

    beforeEach(() => {
        sut = event<TestType>('sut');
    });

    describe("when subscribed to", () => {
        let subscriber: Mock<(value: TestType) => void>;

        beforeEach(() => {
            subscriber = mock();
            sut.subscribe(subscriber);
        });

        test("when called, passes value to subscribers", () => {
            let value = { foo: 'foo', bar: 1 };

            sut(value);

            expect(subscriber).toHaveBeenCalledWith(value);
        });
    });

    test("when handler calls another event, throws", () => {
        let otherEvent = event<void>('otherEvent');
        sut.subscribe(() => otherEvent(undefined));

        try {
            sut({ foo: 'foo', bar: 1 });
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(ChainedEventsError);
            expect((e as ChainedEventsError).currentEvent).toBe(sut.displayName);
            expect((e as ChainedEventsError).newEvent).toBe(otherEvent.displayName);
        }
    });

    describe("scope", () => {
        let scoped: any;
        let rootSubscriber: Mock<(value: TestType) => void>;
        let scopedSubscriber: Mock<(value: TestType) => void>;

        beforeEach(() => {
            scoped = sut.scope({ foo: 'foo' });
            rootSubscriber = mock();
            scopedSubscriber = mock();
            sut.subscribe(rootSubscriber);
            scoped.subscribe(scopedSubscriber);
        });

        test("when non-matching value passed to parent event, scoped event does not pass on value", () => {
            sut({ foo: 'bar', bar: 1 });

            expect(scopedSubscriber).not.toHaveBeenCalled();
        });

        test("when matching value passed to parent event, scoped event passed on value", () => {
            let value = { foo: 'foo', bar: 1 };

            sut(value);

            expect(scopedSubscriber).toHaveBeenCalledWith(value);
        });

        test("when called with partial value, scoped event fills in scope values", () => {
            scoped({ bar: 2 });

            expect(rootSubscriber).toHaveBeenCalledWith(expect.objectContaining({ foo: 'foo', bar: 2 }));
            expect(scopedSubscriber).toHaveBeenCalledWith(expect.objectContaining({ foo: 'foo', bar: 2 }));
        });
    });
});

describe("asyncEvent", () => {
    type Result = { foo: string; };
    type Context = { bar: string; };
    let sut: ReturnType<typeof asyncEvent<Result, Context>>;

    let started: Mock<(value: AsyncStart<Result, Context>) => void>;
    let resolved: Mock<(value: AsyncResult<Result, Context>) => void>;
    let rejected: Mock<(value: AsyncError<Context>) => void>;

    beforeEach(() => {
        sut = asyncEvent<Result, Context>();
        started = mock();
        resolved = mock();
        rejected = mock();
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

        test("started event fired", () => expect(started).toHaveBeenCalledWith(expect.objectContaining({ promise, context })));

        test("when promise resolved, resolved event fired", async () => {
            let result = { foo: 'result' };
            resolve(result);
            await promise;

            expect(resolved).toHaveBeenCalledWith(expect.objectContaining({ result, context }));
        });

        test("when promise rejected, rejected event fired", async () => {
            let error = { message: 'error' };
            reject(error);
            await promise.catch(() => { }); // Catch to prevent unhandled rejection

            expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ error, context }));
        });
    });
});