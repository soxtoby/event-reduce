import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { Subject } from 'event-reduce/lib/subject';

describe("Subject", () => {
    let sut: Subject<number>;

    beforeEach(() => {
        sut = new Subject<number>(() => 'test');
    });

    describe("when subscribed to", () => {
        let observer1: Mock<(value: number) => void>;
        let observer2: Mock<(value: number) => void>;
        let unsub1: () => void;
        let unsub2: () => void;

        beforeEach(() => {
            observer1 = mock();
            observer2 = mock();
            unsub1 = sut.subscribe(observer1);
            unsub2 = sut.subscribe(observer2);
        });

        describe("when provided a value", () => {
            beforeEach(() => {
                sut.next(1);
            });

            test("passes value to subscribers", () => {
                expect(observer1).toHaveBeenCalledWith(1);
                expect(observer2).toHaveBeenCalledWith(1);
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
                    expect(observer1).not.toHaveBeenCalled();
                    expect(observer2).toHaveBeenCalledWith(2);
                });
            });
        });
    });
});
