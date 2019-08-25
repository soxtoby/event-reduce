import * as sinon from 'sinon';
import { describe, it, test, then, when } from 'wattle';
import { reduce } from '../src/reduction';
import { Subject } from '../src/subject';
import './setup';
import { collectAccessedValues } from '../src/observableValue';

describe(reduce.name, function () {
    when("unbound", () => {
        let subscriber = sinon.stub();
        let sut = reduce(1, 'sut');
        sut.subscribe(subscriber);

        it("starts with initial value", () => sut.value.should.equal(1));

        when("subscribed to an observable", () => {
            let subject = new Subject<string>(() => 'test');
            let reducer = sinon.stub();
            sut.on(subject, reducer);

            when("observable emits a value", () => {
                reducer.returns(3);
                subject.next('foo');

                then("reducer called with previous value and observable value", () => reducer.should.have.been.calledWith(1, 'foo'));

                then("value becomes return value of reducer", () => sut.value.should.equal(3));

                when("another value is emitted", () => {
                    reducer.returns(4);
                    subject.next('bar');

                    then("reducer called with previous value and observable value", () => reducer.should.have.been.calledWith(3, 'bar'));

                    then("value becomes return value of reducer", () => sut.value.should.equal(4));
                });
            });
        });

        when("a reducer accesses a reduced value", () => {
            let other = reduce(0);
            let subject = new Subject<number>(() => 'test');
            sut.on(subject, () => other.value);

            when("other value based on same event", () => {
                other.on(subject, () => 0);

                it("throws", () => (() => subject.next(0)).should.throw("Accessed a reduced value derived from the same event being fired."));
            });

            when("other value not based on same event", () => {
                it("doesn't throw", () => subject.next(0));
            });
        });

        when("subscribing to an observable based on itself", () => {
            let observable = sut.filter(n => n > 3);
            observable.displayName = 'dependant observable';
            let action = () => sut.on(observable, (_, n) => n);

            it("throws", () => action.should.throw("Cannot subscribe to 'dependant observable', as it depends on this reduction, 'sut'."));
        });
    });

    when("bound to events object", () => {
        let events = {};
        let sut = reduce(1, events);

        when("subscribing to an observable", () => {
            let subject = new Subject<string>(() => 'test');
            let getEvent = sinon.spy(() => subject);
            let reducer = sinon.stub();
            sut.on(getEvent, reducer);

            then("event getter called with bound events", () => getEvent.should.have.been.calledWith(events));

            then("reduction subscribed to result of event getter", () => {
                subject.next('foo');
                reducer.should.have.been.calledWith(1, 'foo');
            });
        });
    });

    test("accessed reductions updated when value is accessed", () => {
        let r1 = reduce(1);
        let r2 = reduce(2);

        let accessed = collectAccessedValues(() => {
            r1.value;
            r2.value;
        });

        Array.from(accessed).should.have.members([r1, r2]);
    });
});