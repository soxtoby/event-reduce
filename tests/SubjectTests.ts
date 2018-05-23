import * as sinon from 'sinon';
import { describe, it, when } from 'wattle';
import { Subject } from '../src/subject';
import './setup';

describe("Subject", function () {
    let sut = new Subject<number>();

    when("subscribed to", () => {
        let observer1 = { next: sinon.spy() };
        let observer2Spy = sinon.spy();
        let observer2 = { next: observer2Spy };
        let unsub1 = sut.subscribe(observer1);
        let unsub2 = sut.subscribe(observer2);

        when("provided a value", () => {
            sut.next(1);

            it("passes value to subscribers", () => {
                observer1.next.should.have.been.calledWithExactly(1);
                observer2Spy.should.have.been.calledWithExactly(1);
            });
        });

        when("unsubscribed", () => {
            unsub1.unsubscribe();

            when("provided a value", () => {
                sut.next(2);

                it("doesn't pass value to unsubscribed subscriber", () => {
                    observer1.next.should.not.have.been.called;
                    observer2Spy.should.have.been.calledWithExactly(2);
                });
            });
        });
    });
});
