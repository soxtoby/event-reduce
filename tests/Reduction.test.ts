import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { event, events, reduce } from 'event-reduce';
import { AccessedValueWithCommonSourceError, collectAccessedValues } from 'event-reduce/lib/observableValue';
import { CircularSubscriptionError, IBoundReduction, IReduction, ReducedEventsError } from "event-reduce/lib/reduction";
import { Subject } from 'event-reduce/lib/subject';

describe("reduce", () => {
    describe("when unbound", () => {
        let subscriber: Mock<(value: number) => void>;
        let sut: IReduction<number>;

        beforeEach(() => {
            subscriber = mock();
            sut = reduce(1, 'sut');
            sut.subscribe(subscriber);
        });

        test("starts with initial value", () => expect(sut.value).toBe(1));

        describe("when subscribed to an observable", () => {
            let subject: Subject<string>;
            let reducer: Mock<(previous: number, event: string) => number>;

            beforeEach(() => {
                subject = new Subject<string>(() => 'test');
                reducer = mock();
                sut.on(subject, reducer);
            });

            describe("when observable emits a value", () => {
                beforeEach(() => {
                    reducer.mockReturnValue(3);
                    subject.next('foo');
                });

                test("reducer called with previous value and observable value", () => {
                    expect(reducer).toHaveBeenCalledWith(1, 'foo');
                });

                test("value becomes return value of reducer", () => expect(sut.value).toBe(3));

                describe("when another value is emitted", () => {
                    beforeEach(() => {
                        reducer.mockReturnValue(4);
                        subject.next('bar');
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
            let subject: Subject<number>;

            beforeEach(() => {
                other = reduce(0);
                subject = new Subject<number>(() => 'test');
                sut.on(subject, () => other.value);
            });

            describe("when other value based on same event", () => {
                beforeEach(() => {
                    other.on(subject, () => 0);
                });

                test("throws", () => {
                    try {
                        subject.next(0);
                        expect.unreachable("Should have thrown");
                    } catch (e) {
                        expect(e).toBeInstanceOf(AccessedValueWithCommonSourceError);
                        expect((e as AccessedValueWithCommonSourceError).commonSource).toBe(subject);
                        expect((e as AccessedValueWithCommonSourceError).triggeringObservable).toBe(subject);
                        expect((e as AccessedValueWithCommonSourceError).accessedObservable).toBe(other as any);
                    }
                });
            });

            describe("when other value not based on same event", () => {
                test("doesn't throw", () => subject.next(0));
            });
        });

        describe("when subscribing to an observable based on itself", () => {
            test("throws", () => {
                let observable = sut.filter(n => n > 3);
                try {
                    sut.on(observable, (_, n) => n);
                    expect.unreachable("Should have thrown");
                } catch (e) {
                    expect(e).toBeInstanceOf(CircularSubscriptionError);
                    expect((e as CircularSubscriptionError).observable).toBe(observable);
                    expect((e as CircularSubscriptionError).reduction).toBe(sut);
                }
            });
        });
    });

    describe("when bound to events object", () => {
        let eventsObj: {};
        let sut: IBoundReduction<number, typeof eventsObj>;

        beforeEach(() => {
            eventsObj = {};
            sut = reduce(1, eventsObj);
        });

        describe("when subscribing to an observable", () => {
            let subject: Subject<string>;
            let getEvent: Mock<(events: typeof eventsObj) => Subject<string>>;
            let reducer: Mock<(previous: number, event: string) => number>;

            beforeEach(() => {
                subject = new Subject<string>(() => 'test');
                getEvent = mock(() => subject);
                reducer = mock();
                sut.on(getEvent, reducer);
            });

            test("event getter called with bound events", () => {
                expect(getEvent).toHaveBeenCalledWith(eventsObj);
            });

            test("reduction subscribed to result of event getter", () => {
                subject.next('foo');
                expect(reducer).toHaveBeenCalledWith(1, 'foo');
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

        expect(Array.from(accessed)).toContain(r1 as any);
        expect(Array.from(accessed)).toContain(r2 as any);
    });

    describe("when reducer returns an event", () => {
        test("throws", () => {
            let eventValue = event('test event');
            let subject = new Subject<string>(() => 'test');
            let sut = reduce(null as any, 'sut')
                .on(subject, () => eventValue);

            try {
                subject.next('foo');
                expect.unreachable("Should have thrown");
            } catch (e) {
                expect(e).toBeInstanceOf(ReducedEventsError);
                expect((e as ReducedEventsError).reduction).toBe(sut);
                expect((e as ReducedEventsError).value).toBe(eventValue);
            }
        });
    });

    describe("when reducer returns an events object", () => {
        test("throws", () => {
            @events
            class Events { }
            let eventsValue = new Events();
            let subject = new Subject<string>(() => 'test');
            let sut = reduce(null as any, 'sut')
                .on(subject, () => eventsValue);

            try {
                subject.next('foo');
                expect.unreachable("Should have thrown");
            } catch (e) {
                expect(e).toBeInstanceOf(ReducedEventsError);
                expect((e as ReducedEventsError).reduction).toBe(sut);
                expect((e as ReducedEventsError).value).toBe(eventsValue);
            }
        });
    });
});