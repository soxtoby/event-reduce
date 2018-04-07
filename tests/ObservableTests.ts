import './setup';
import { describe, when, then, test, it } from 'wattle';
import { Observable, IObservable } from '../src/observable';
import { SynchronousPromise } from 'synchronous-promise';
import * as sinon from 'sinon';
import { testObservableOperators } from './ObservableOperatorTests';

describe("Observable", function () {
    when("subscribing", () => {
        let unsubscribe = sinon.spy();
        let subscribe = sinon.spy(() => unsubscribe);
        let sut = new Observable(subscribe);
        let next = sinon.spy();
        let result = sut.subscribe(next);

        then("subscribe function called with observer", () => subscribe.should.have.been.calledWith(sinon.match({ next })));

        then("unsubscribe function returned", () => result.should.equal(unsubscribe));
    });

    testObservableOperators();
});

    