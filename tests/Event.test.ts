import { describe, test, expect, beforeEach } from "bun:test";
import { asyncEvent, event } from 'event-reduce';
import { ChainedEventsError } from "event-reduce/lib/events";
import * as sinon from 'sinon';
import { SynchronousPromise } from 'synchronous-promise';

describe(event.name, () => {
    type TestType = { foo: string, bar: number };
    let sut: ReturnType<typeof event<TestType>>;

    beforeEach(() => {
        sut = event<TestType>('sut');
    });

    describe("when subscribed to", () => {
        let subscriber: sinon.SinonStub;

        beforeEach(() => {
            subscriber = sinon.stub();
            sut.subscribe(subscriber);
        });

        describe("when called", () => {
            let value: TestType;

            beforeEach(() => {
                value = { foo: 'foo', bar: 1 };
                sut(value);
            });

            test("passes value to subscribers", () => expect(subscriber.calledWith(value)).toBe(true));
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
        let rootSubscriber: sinon.SinonStub;
        let scopedSubscriber: sinon.SinonStub;

        beforeEach(() => {
            scoped = sut.scope({ foo: 'foo' });
            rootSubscriber = sinon.stub();
            scopedSubscriber = sinon.stub();
            sut.subscribe(rootSubscriber);
            scoped.subscribe(scopedSubscriber);
        });

        describe("when non-matching value passed to parent event", () => {
            beforeEach(() => {
                sut({ foo: 'bar', bar: 1 });
            });

            test("scoped event does not pass on value", () => expect(scopedSubscriber.called).toBe(false));
        });

        describe("when matching value passed to parent event", () => {
            let value: TestType;

            beforeEach(() => {
                value = { foo: 'foo', bar: 1 };
                sut(value);
            });

            test("scoped event passed on value", () => expect(scopedSubscriber.calledWith(value)).toBe(true));
        });

        describe("when called with partial value", () => {
            beforeEach(() => {
                scoped({ bar: 2 });
            });

            test("scoped event fills in scope values", () => {
                expect(rootSubscriber.calledWith(sinon.match({ foo: 'foo', bar: 2 }))).toBe(true);
                expect(scopedSubscriber.calledWith(sinon.match({ foo: 'foo', bar: 2 }))).toBe(true);
            });
        });
    });
});

describe(asyncEvent.name, () => {
    type Result = { foo: string; };
    type Context = { bar: string; };
    let sut: ReturnType<typeof asyncEvent<Result, Context>>;

    let started: sinon.SinonStub;
    let resolved: sinon.SinonStub;
    let rejected: sinon.SinonStub;

    beforeEach(() => {
        sut = asyncEvent<Result, Context>();
        started = sinon.stub();
        resolved = sinon.stub();
        rejected = sinon.stub();
        sut.started.subscribe(started);
        sut.resolved.subscribe(resolved);
        sut.rejected.subscribe(rejected);
    });

    describe("when called", () => {
        let promise: SynchronousPromise<Result>;
        let context: Context;

        beforeEach(() => {
            promise = SynchronousPromise.unresolved<Result>();
            context = { bar: 'context' };
            sut(promise, context);
        });

        test("started event fired", () => expect(started.calledWith(sinon.match({ promise, context }))).toBe(true));

        describe("when promise resolved", () => {
            let result: Result;

            beforeEach(() => {
                result = { foo: 'result' };
                (promise as any).resolve(result);
            });

            test("resolved event fired", () => expect(resolved.calledWith(sinon.match({ result, context }))).toBe(true));
        });

        describe("when promise rejected", () => {
            let error: { message: string };

            beforeEach(() => {
                error = { message: 'error' };
                (promise as any).reject(error);
            });

            test("rejected event fired", () => expect(rejected.calledWith(sinon.match({ error, context }))).toBe(true));
        });
    });
});