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

        describe("when called", () => {
            let value: TestType;

            beforeEach(() => {
                value = { foo: 'foo', bar: 1 };
                sut(value);
            });

            test("passes value to subscribers", () => expect(subscriber).toHaveBeenCalledWith(value));
        });
    });

    describe("when handler calls another event", () => {
        let otherEvent: ReturnType<typeof event<void>>;

        beforeEach(() => {
            otherEvent = event<void>('otherEvent');
            sut.subscribe(() => otherEvent(undefined));
        });

        test("throws", () => {
            try {
                sut({ foo: 'foo', bar: 1 });
                expect.unreachable("Should have thrown");
            } catch (e) {
                expect(e).toBeInstanceOf(ChainedEventsError);
                expect((e as ChainedEventsError).currentEvent).toBe(sut.displayName);
                expect((e as ChainedEventsError).newEvent).toBe(otherEvent.displayName);
            }
        });
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

        describe("when non-matching value passed to parent event", () => {
            beforeEach(() => {
                sut({ foo: 'bar', bar: 1 });
            });

            test("scoped event does not pass on value", () => expect(scopedSubscriber).not.toHaveBeenCalled());
        });

        describe("when matching value passed to parent event", () => {
            let value: TestType;

            beforeEach(() => {
                value = { foo: 'foo', bar: 1 };
                sut(value);
            });

            test("scoped event passed on value", () => expect(scopedSubscriber).toHaveBeenCalledWith(value));
        });

        describe("when called with partial value", () => {
            beforeEach(() => {
                scoped({ bar: 2 });
            });

            test("scoped event fills in scope values", () => {
                expect(rootSubscriber).toHaveBeenCalledWith(expect.objectContaining({ foo: 'foo', bar: 2 }));
                expect(scopedSubscriber).toHaveBeenCalledWith(expect.objectContaining({ foo: 'foo', bar: 2 }));
            });
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

        describe("when promise resolved", () => {
            let result: Result;

            beforeEach(async () => {
                result = { foo: 'result' };
                resolve(result);
                await promise;
            });

            test("resolved event fired", () => expect(resolved).toHaveBeenCalledWith(expect.objectContaining({ result, context })));
        });

        describe("when promise rejected", () => {
            let error: { message: string };

            beforeEach(async () => {
                error = { message: 'error' };
                reject(error);
                await promise.catch(() => { }); // Catch to prevent unhandled rejection
            });

            test("rejected event fired", () => expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ error, context })));
        });
    });
});