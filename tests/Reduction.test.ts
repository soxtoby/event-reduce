import { afterEach, beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { Atom, createModel, event, events, IReduction, reduce } from 'event-reduce/src/signals';
import { CircularSubscriptionError } from "event-reduce/src/signals/reduction";
import { InvalidStateError } from "event-reduce/src/signals/signals";
import { CircularDependencyError, collectAccessedSources } from "event-reduce/src/signals/tracking";
import { dispose } from "event-reduce/src/utils";
import { MockObserver } from "./MockObserver";

describe("reduce", () => {
    describe("when unbound", () => {
        let subscriber: MockObserver<number>;
        let sut: IReduction<number>;

        beforeEach(() => {
            subscriber = new MockObserver<number>();
            sut = createModel(() => reduce(1, 'sut'));
            sut.subscribe(subscriber);
        });

        afterEach(() => {
            sut[dispose]();
        });

        test("starts with initial value", () => expect(sut.value).toBe(1));

        describe("when subscribed to an observable", () => {
            let atom: Atom<string>;
            let reducer: Mock<(previous: number, event: string) => number>;

            beforeEach(() => {
                atom = new Atom<string>('test', 'test');
                reducer = mock();
                sut.on(atom, reducer);
            });

            describe("when observable emits a value", () => {
                beforeEach(() => {
                    reducer.mockReturnValue(3);
                    atom.setValue('foo');
                });

                test("reducer called with previous value and observable value", () => {
                    expect(reducer).toHaveBeenCalledWith(1, 'foo');
                });

                test("value becomes return value of reducer", () => expect(sut.value).toBe(3));

                describe("when another value is emitted", () => {
                    beforeEach(() => {
                        reducer.mockReturnValue(4);
                        atom.setValue('bar');
                    });

                    test("reducer called with previous value and observable value", () => {
                        expect(reducer).toHaveBeenCalledWith(3, 'bar');
                    });

                    test("value becomes return value of reducer", () => expect(sut.value).toBe(4));
                });
            });
        });

        describe("when a reducer accesses a reduced value", () => {
            let other: ReturnType<typeof reduce<number>>;
            let source: Atom<number>;

            beforeEach(() => {
                other = createModel(() => reduce(0));
                source = new Atom<number>('test', 0);
                sut.on(source, () => other.value);
            });

            afterEach(() => {
                other[dispose]();
            })

            test("when other value based on same source, uses latest value", () => {
                other.on(source, (_, value) => value);

                source.setValue(3);

                expect(other.value).toBe(3);
                expect(sut.value).toBe(3);
            });

            test("when other value also accesses current reduction, throws", () => {
                other.on(source, () => sut.value);

                try {
                    source.setValue(1);
                    expect.unreachable("Should have thrown");
                } catch (e) {
                    expect(e).toBeInstanceOf(CircularDependencyError);
                }
            });

            test("when other value not based on same event, doesn't throw", () => {
                source.setValue(0);
            });
        });

        test("when subscribing to an observable based on itself, throws", () => {
            let source = sut.filter(n => n > 3);
            try {
                sut.on(source, (_, n) => n);
                expect.unreachable("Should have thrown");
            } catch (e) {
                expect(e).toBeInstanceOf(CircularSubscriptionError);
                expect((e as CircularSubscriptionError).source).toBe(source);
                expect((e as CircularSubscriptionError).reduction).toBe(sut);
            }
        });
    });

    describe("when bound to events object", () => {
        let eventsObj: {};
        let sut: IReduction<number, typeof eventsObj>;

        beforeEach(() => {
            eventsObj = {};
            sut = createModel(() => reduce(1, eventsObj));
        });

        afterEach(() => {
            sut[dispose]();
        })

        describe("when subscribing to an observable", () => {
            let atom: Atom<string>;
            let getEvent: Mock<(events: typeof eventsObj) => Atom<string>>;
            let reducer: Mock<(previous: number, event: string) => number>;

            beforeEach(() => {
                atom = new Atom<string>('test', 'test');
                getEvent = mock(() => atom);
                reducer = mock();
                sut.on(getEvent, reducer);
            });

            test("event getter called with bound events", () => {
                expect(getEvent).toHaveBeenCalledWith(eventsObj);
            });

            test("reduction subscribed to result of event getter", () => {
                atom.setValue('foo');
                expect(reducer).toHaveBeenCalledWith(1, 'foo');
            });
        });
    });

    test("accessed reductions updated when value is accessed", () => {
        using sut = createModel(() => ({
            r1: reduce(1, 'r1'),
            r2: reduce(2, 'r2')
        }))

        using tracker = collectAccessedSources(null)
        sut.r1.value;
        sut.r2.value;

        expect(tracker.accessed).toContain(sut.r1 as any);
        expect(tracker.accessed).toContain(sut.r2 as any);
    });

    test("when reducer returns an event, throws", () => {
        let eventValue = event('test event');
        let subject = new Atom<string>('test', 'test');
        using sut = createModel(() => ({
            reduction: reduce(null as any, 'sut')
                .on(subject, () => eventValue)
        }))

        try {
            subject.setValue('foo');
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError);
            expect((e as InvalidStateError).source).toBe(sut.reduction);
            expect((e as InvalidStateError).value).toBe(eventValue);
        }
    });

    test("when reducer returns an events object, throws", () => {
        @events
        class Events { }
        let eventsValue = new Events();
        let subject = new Atom<string>('test', 'test');
        using sut = createModel(() => ({
            reduction: reduce(null as any, 'sut')
                .on(subject, () => eventsValue)
        }))

        try {
            subject.setValue('foo');
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError);
            expect((e as InvalidStateError).source).toBe(sut.reduction);
            expect((e as InvalidStateError).value).toBe(eventsValue);
        }
    });
});