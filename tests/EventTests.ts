import { asyncEvent, event } from 'event-reduce';
import * as sinon from 'sinon';
import { SynchronousPromise } from 'synchronous-promise';
import { describe, it, test, then, when } from 'wattle';

describe(event.name, function () {
    type TestType = { foo: string, bar: number };
    let sut = event<TestType>('sut');

    when("subscribed to", () => {
        let subscriber = sinon.stub();
        sut.subscribe(subscriber);

        when("called", () => {
            let value = { foo: 'foo', bar: 1 };

            sut(value);

            it("passes value to subscribers", () => subscriber.should.have.been.calledWith(value));
        });
    });

    when("handler calls another event", () => {
        let otherEvent = event('otherEvent');
        sut.subscribe(() => otherEvent());

        it("throws", () => (() => sut({ foo: 'foo', bar: 1 })).should.throw("Events should not be fired in response to other events. Fired 'otherEvent' in response to 'sut'."));
    });

    test("scope", () => {
        let scoped = sut.scope({ foo: 'foo' });
        let rootSubscriber = sinon.stub();
        let scopedSubscriber = sinon.stub();
        sut.subscribe(rootSubscriber);
        scoped.subscribe(scopedSubscriber);

        when("non-matching value passed to parent event", () => {
            sut({ foo: 'bar', bar: 1 });

            then("scoped event does not pass on value", () => scopedSubscriber.should.not.have.been.called);
        });

        when("matching value passed to parent event", () => {
            let value = { foo: 'foo', bar: 1 };
            sut(value);

            then("scoped event passed on value", () => scopedSubscriber.should.have.been.calledWith(value));
        });

        when("called with partial value", () => {
            scoped({ bar: 2 });

            then("scoped event fills in scope values", () => {
                rootSubscriber.should.have.been.calledWith(sinon.match({ foo: 'foo', bar: 2 }));
                scopedSubscriber.should.have.been.calledWith(sinon.match({ foo: 'foo', bar: 2 }));
            });
        });
    });
});

describe(asyncEvent.name, function () {
    type Result = { foo: string; };
    type Context = { bar: string; };
    let sut = asyncEvent<Result, Context>();

    let started = sinon.stub();
    let resolved = sinon.stub();
    let rejected = sinon.stub();
    sut.started.subscribe(started);
    sut.resolved.subscribe(resolved);
    sut.rejected.subscribe(rejected);

    when("called", () => {
        let promise = SynchronousPromise.unresolved<Result>();
        let context = { bar: 'context' };
        sut(promise, context);

        then("started event fired", () => started.should.have.been.calledWith(sinon.match({ promise, context })));

        when("promise resolved", () => {
            let result = { foo: 'result' };
            promise.resolve(result);

            then("resolved event fired", () => resolved.should.have.been.calledWith(sinon.match({ result, context })));
        });

        when("promise rejected", () => {
            let error = { message: 'error' };
            promise.reject(error);

            then("rejected event fired", () => rejected.should.have.been.calledWith(sinon.match({ error, context })));
        });
    });
});