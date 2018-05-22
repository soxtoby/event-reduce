import * as sinon from 'sinon';
import { describe, then, when, it } from 'wattle';
import { Observable, isObserver, IObserver, SubscriptionObserver } from '../src/observable';
import { testObservableOperators } from './ObservableOperatorTests';
import './setup';

describe("Observable", function () {
    when("subscribing", () => {
        let unsubscribe = sinon.spy();
        let subscribe = sinon.spy(() => unsubscribe);
        let sut = new Observable(subscribe);
        let next = sinon.spy();
        let result = sut.subscribe(next);
        let observer = new SubscriptionObserver({ next });

        then("subscribe function called with observer", () => subscribe.should.have.been.calledWith(sinon.match(observer)));

        then("unsubscribe function returned", () => result.should.equal(unsubscribe));
    });

    testObservableOperators();
});

describe("SubscriptionObserver", function () {
    let observer = { 
        next: sinon.spy(),
        error: sinon.spy(),
        complete: sinon.spy()
    };
    
    let sut = new SubscriptionObserver(observer);

    when("next", () => {
        let nextValue = { prop: "value" };

        when("not closed", () => {
            sut.next(nextValue);

            it("calls inner observer", () => observer.next.calledWith(nextValue));
            it("is not closed", () => sut.closed.should.be.false);
        });

        when("is closed", () => {
            sut.complete();
            sut.next(nextValue);

            it("does not call inner observer", () => observer.next.notCalled);
        });
    });

    when("error", () => {
        let error = "error message";
        sut.error(error);

        it("calls inner observer", () => observer.error.calledWith(error));
        it("is closed", () => sut.closed.should.be.true);
    });

    when("complete", () => {
        sut.complete();

        it("calls inner observer", () => observer.error.called);
        it("is closed", () => sut.closed.should.be.true);
    });
});
