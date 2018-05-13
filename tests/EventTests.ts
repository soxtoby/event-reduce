import * as sinon from 'sinon';
import { describe, it, test, then, when } from 'wattle';
import { event } from './../src/events';
import './setup';

describe("event", function () {
    type TestType = { foo: string, bar: number };
    let sut = event<TestType>();

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
        let otherEvent = event();
        sut.subscribe(() => otherEvent());

        it("throws", () => (() => sut({ foo: 'foo', bar: 1 })).should.throw("Fired an event in response to another event."));
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