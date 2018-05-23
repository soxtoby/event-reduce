import * as sinon from 'sinon';
import { describe, it, then, when } from 'wattle';
import { Observable, createSubscriptionObserver } from '../src/observable';
import { testObservableOperators } from './ObservableOperatorTests';
import './setup';

describe("Observable", function () {
    when("subscribing", () => {
        let unsubscribe = sinon.spy();
        let subscribe = sinon.spy(() => unsubscribe);
        let next = sinon.spy();
        let observer = { next };

        let sut = new Observable(subscribe);
        let result = sut.subscribe(next);

        then("subscribe function called with observer", () => subscribe.should.have.been.calledWith(sinon.match(observer)));

        then("unsubscribe function returned", () => result.should.equal(unsubscribe));
    });

    testObservableOperators();
});

describe("createSubscriptionObserver", function () {
    let observer = {
        next: sinon.spy(),
        error: sinon.spy(),
        complete: sinon.spy()
    };

    let sut = createSubscriptionObserver(observer);

    when("next", () => {
        let nextValue = { prop: "value" };

        it("calls inner observer", () => observer.next.calledWith(nextValue));
    });

    when("error", () => {
        let error = "error message";
        sut.error(error);

        it("calls inner observer", () => observer.error.calledWith(error));
    });

    when("complete", () => {
        sut.complete();

        it("calls inner observer", () => observer.error.called);
    });
});
