import * as sinon from 'sinon';
import { describe, it, when } from 'wattle';
import { Subject } from '../src/subject';
import './setup';

describe("Subject", function () {
    let sut = new Subject<number>('test');

    when("subscribed to", () => {
        let observer1 = sinon.spy();
        let observer2 = sinon.spy();
        let unsub1 = sut.subscribe(observer1);
        let unsub2 = sut.subscribe(observer2);

        when("provided a value", () => {
            sut.next(1);

            it("passes value to subscribers", () => {
                observer1.should.have.been.calledWithExactly(1);
                observer2.should.have.been.calledWithExactly(1);
            });
        });

        when("unsubscribed", () => {
            unsub1();

            when("provided a value", () => {
                sut.next(2);

                it("doesn't pass value to unsubscribed subscriber", () => {
                    observer1.should.not.have.been.called;
                    observer2.should.have.been.calledWithExactly(2);
                });
            });
        });
    });
});
