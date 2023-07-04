import { asyncEvent, event } from 'event-reduce';
import { AsyncError, AsyncResult, AsyncStart, ChainedEventsError } from "event-reduce/lib/events";
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

        it("throws", () => {
            let err = (() => sut({ foo: 'foo', bar: 1 })).should.throw(ChainedEventsError);
            err.has.property('currentEvent', sut.displayName);
            err.has.property('newEvent', otherEvent.displayName);
        });
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

    let started = sinon.stub<[AsyncStart<Result, Context>]>();
    let resolved = sinon.stub<[AsyncResult<Result, Context>]>();
    let rejected = sinon.stub<[AsyncError<Context>]>();
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

    test("correlation id", () => {
        started.resetHistory();
        resolved.resetHistory();
        rejected.resetHistory();
        let context = { bar: 'context' };

        when("async event called twice", () => {
            let firstPromise = SynchronousPromise.unresolved<Result>();
            let secondPromise = SynchronousPromise.unresolved<Result>();

            sut(firstPromise, context);
            sut(secondPromise, context);

            then("started event fired with different ids", () => {
                started.should.have.been.calledTwice;
                started.firstCall.args[0].id.should.not.equal(started.secondCall.args[0].id);
            });

            test("first promise completes first", () => {

                when("first promise resolved", () => {
                    let firstResult = { foo: 'first' };
                    firstPromise.resolve(firstResult);

                    then("resolved event fired with id for first promise", () => resolved.should.have.been.calledWith(sinon.match({ id: started.firstCall.args[0].id, result: firstResult })));

                    when("second promise resolved", () => {
                        let secondResult = { foo: 'second' };
                        secondPromise.resolve(secondResult);

                        then("resolved event fired with id for second promise", () => resolved.should.have.been.calledWith(sinon.match({ id: started.secondCall.args[0].id, result: secondResult })));
                    });

                    when("second promise rejected", () => {
                        let error = { message: 'second promise rejected' };
                        secondPromise.reject(error);

                        then("rejected event fired with id for second promise", () => rejected.should.have.been.calledWith(sinon.match({ id: started.secondCall.args[0].id, error })));
                    });
                });

                when("first promise rejected", () => {
                    let firstError = { message: 'first promise rejected' };
                    firstPromise.reject(firstError);

                    then("rejected event fired with id for first promise", () => rejected.should.have.been.calledWith(sinon.match({ id: started.firstCall.args[0].id, error: firstError })));

                    when("second promise resolved", () => {
                        let secondResult = { foo: 'second' };
                        secondPromise.resolve(secondResult);

                        then("resolved event fired with id for second promise", () => resolved.should.have.been.calledWith(sinon.match({ id: started.secondCall.args[0].id, result: secondResult })));
                    });

                    when("second promise rejected", () => {
                        let secondError = { message: 'second promise rejected' };
                        secondPromise.reject(secondError);

                        then("rejected event fired with id for second promise", () => rejected.should.have.been.calledWith(sinon.match({ id: started.secondCall.args[0].id, error: secondError })));
                    });
                });
            });

            test("second promise completes first", () => {

                when("second promise resolved", () => {
                    let secondResult = { foo: 'second' };
                    secondPromise.resolve(secondResult);

                    then("resolved event fired with id for second promise", () => resolved.should.have.been.calledWith(sinon.match({ id: started.secondCall.args[0].id, result: secondResult })));

                    when("first promise resolved", () => {
                        let firstResult = { foo: 'first' };
                        firstPromise.resolve(firstResult);

                        then("resolved event fired with id for first promise", () => resolved.should.have.been.calledWith(sinon.match({ id: started.firstCall.args[0].id, result: firstResult })));
                    });

                    when("first promise rejected", () => {
                        let error = { message: 'first promise rejected' };
                        firstPromise.reject(error);

                        then("rejected event fired with id for first promise", () => rejected.should.have.been.calledWith(sinon.match({ id: started.firstCall.args[0].id, error })));
                    });
                });

                when("second promise rejected", () => {
                    let secondError = { message: 'second promise rejected' };
                    secondPromise.reject(secondError);

                    then("rejected event fired with id for second promise", () => rejected.should.have.been.calledWith(sinon.match({ id: started.secondCall.args[0].id, error: secondError })));

                    when("first promise resolved", () => {
                        let firstResult = { foo: 'first' };
                        firstPromise.resolve(firstResult);

                        then("resolved event fired with id for first promise", () => resolved.should.have.been.calledWith(sinon.match({ id: started.firstCall.args[0].id, result: firstResult })));
                    });

                    when("first promise rejected", () => {
                        let firstError = { message: 'first promise rejected' };
                        firstPromise.reject(firstError);

                        then("rejected event fired with id for first promise", () => rejected.should.have.been.calledWith(sinon.match({ id: started.firstCall.args[0].id, error: firstError })));
                    });
                });
            });
        });
    });
});

