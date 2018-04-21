import * as sinon from 'sinon';
import { describe, then, when } from 'wattle';
import { Observable } from '../src/observable';
import { testObservableOperators } from './ObservableOperatorTests';
import './setup';

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

    