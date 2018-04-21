import * as sinon from 'sinon';
import { describe, it, test, then, when } from 'wattle';
import { event } from '../src/events';
import './setup';

describe("action", function () {
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

    test("scope", () => {
        let scoped = sut.scope({ foo: 'foo' });
        let rootSubscriber = sinon.stub();
        let scopedSubscriber = sinon.stub();
        sut.subscribe(rootSubscriber);
        scoped.subscribe(scopedSubscriber);

        when("non-matching value passed to parent action", () => {
            sut({ foo: 'bar', bar: 1 });

            then("scoped action does not pass on value", () => scopedSubscriber.should.not.have.been.called);
        });

        when("matching value passed to parent action", () => {
            let value = { foo: 'foo', bar: 1 };
            sut(value);

            then("scoped action passed on value", () => scopedSubscriber.should.have.been.calledWith(value));
        });

        when("called with partial value", () => {
            scoped({ bar: 2 });

            then("scoped action fills in scope values", () => {
                rootSubscriber.should.have.been.calledWith(sinon.match({ foo: 'foo', bar: 2 }));
                scopedSubscriber.should.have.been.calledWith(sinon.match({ foo: 'foo', bar: 2 }));
            });
        });
    });
});