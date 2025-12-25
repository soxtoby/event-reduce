import { describe, test, expect, beforeEach } from "bun:test";
import { Subject } from 'event-reduce/lib/subject';
import * as sinon from 'sinon';

describe(Subject.name, () => {
    let sut: Subject<number>;

    beforeEach(() => {
        sut = new Subject<number>(() => 'test');
    });

    describe("when subscribed to", () => {
        let observer1: sinon.SinonSpy;
        let observer2: sinon.SinonSpy;
        let unsub1: () => void;
        let unsub2: () => void;

        beforeEach(() => {
            observer1 = sinon.spy();
            observer2 = sinon.spy();
            unsub1 = sut.subscribe(observer1);
            unsub2 = sut.subscribe(observer2);
        });

        describe("when provided a value", () => {
            beforeEach(() => {
                sut.next(1);
            });

            test("passes value to subscribers", () => {
                expect(observer1.calledWithExactly(1)).toBe(true);
                expect(observer2.calledWithExactly(1)).toBe(true);
            });
        });

        describe("when unsubscribed", () => {
            beforeEach(() => {
                unsub1();
            });

            describe("when provided a value", () => {
                beforeEach(() => {
                    sut.next(2);
                });

                test("doesn't pass value to unsubscribed subscriber", () => {
                    expect(observer1.called).toBe(false);
                    expect(observer2.calledWithExactly(2)).toBe(true);
                });
            });
        });
    });
});
