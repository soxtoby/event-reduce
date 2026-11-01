import { afterEach, beforeEach, describe, expect, mock, test, type Mock } from "bun:test"
import { createModel, derive, event, events, IReduction, ISignal, reduce, signal } from 'event-reduce'
import { InvalidStateError, SourcesChangedTogetherError } from "event-reduce/lib/observable"
import { CircularSubscriptionError } from "event-reduce/lib/reduction"
import { CircularDependencyError, collectAccessedSources } from "event-reduce/lib/tracking"
import { dispose } from "event-reduce/lib/utils"
import { MockObserver } from "./MockObserver"

describe("reduce", () => {
    describe("when unbound", () => {
        let subscriber: MockObserver<number>
        let sut: IReduction<number>

        beforeEach(() => {
            subscriber = new MockObserver<number>()
            sut = createModel(() => ({ sut: reduce(1, 'sut') })).sut
            sut.subscribe(subscriber)
        })

        afterEach(() => {
            sut[dispose]()
        })

        test("starts with initial value", () => expect(sut.value).toBe(1))

        describe("when subscribed to an observable", () => {
            let observableValue: ISignal<string>
            let reducer: Mock<(previous: number, event: string) => number>

            beforeEach(() => {
                observableValue = signal('test', 'test')
                reducer = mock()
                sut.on(observableValue, reducer)
            })

            describe("when observable emits a value", () => {
                beforeEach(() => {
                    reducer.mockReturnValue(3)
                    observableValue.setValue('foo')
                })

                test("reducer called with previous value and observable value", () => {
                    expect(reducer).toHaveBeenCalledWith(1, 'foo')
                })

                test("value becomes return value of reducer", () => expect(sut.value).toBe(3))

                describe("when another value is emitted", () => {
                    beforeEach(() => {
                        reducer.mockReturnValue(4)
                        observableValue.setValue('bar')
                    })

                    test("reducer called with previous value and observable value", () => {
                        expect(reducer).toHaveBeenCalledWith(3, 'bar')
                    })

                    test("value becomes return value of reducer", () => expect(sut.value).toBe(4))
                })
            })
        })

        describe("when a reducer accesses a reduced value", () => {
            let other: ReturnType<typeof reduce<number>>
            let observable: ISignal<number>

            beforeEach(() => {
                other = createModel(() => ({ other: reduce(0) })).other
                observable = signal(0, 'test')
                sut.on(observable, () => other.value)
            })

            afterEach(() => {
                other[dispose]()
            })

            test("when other value based on same source, uses latest value", () => {
                other.on(observable, (_, value) => value)

                observable.setValue(3)

                expect(other.value).toBe(3)
                expect(sut.value).toBe(3)
            })

            test("when other value also accesses current reduction, throws", () => {
                other.on(observable, () => sut.value)

                try {
                    observable.setValue(1)
                    expect.unreachable("Should have thrown")
                } catch (e) {
                    expect(e).toBeInstanceOf(CircularDependencyError)
                }
            })

            test("when other value not based on same event, doesn't throw", () => {
                observable.setValue(0)
            })
        })

        test("when subscribing to an observable based on itself, throws", () => {
            let observable = sut.filter(n => n > 3)
            try {
                sut.on(observable, (_, n) => n)
                expect.unreachable("Should have thrown")
            } catch (e) {
                expect(e).toBeInstanceOf(CircularSubscriptionError)
                expect((e as CircularSubscriptionError).source).toBe(observable)
                expect((e as CircularSubscriptionError).reduction).toBe(sut)
            }
        })
    })

    describe("when bound to events object", () => {
        let eventsObj: {}
        let sut: IReduction<number, typeof eventsObj>

        beforeEach(() => {
            eventsObj = {}
            sut = createModel(() => ({ sut: reduce(1, eventsObj) })).sut
        })

        afterEach(() => {
            sut[dispose]()
        })

        describe("when subscribing to an observable", () => {
            let observableValue: ISignal<string>
            let getEvent: Mock<(events: typeof eventsObj) => ISignal<string>>
            let reducer: Mock<(previous: number, event: string) => number>

            beforeEach(() => {
                observableValue = signal('test', 'test')
                getEvent = mock(() => observableValue)
                reducer = mock()
                sut.on(getEvent, reducer)
            })

            test("event getter called with bound events", () => {
                expect(getEvent).toHaveBeenCalledWith(eventsObj)
            })

            test("reduction subscribed to result of event getter", () => {
                observableValue.setValue('foo')
                expect(reducer).toHaveBeenCalledWith(1, 'foo')
            })
        })
    })

    test("accessed reductions updated when value is accessed", () => {
        using sut = createModel(() => ({
            r1: reduce(1, 'r1'),
            r2: reduce(2, 'r2')
        }))

        using tracker = collectAccessedSources(null)
        sut.r1.value
        sut.r2.value

        expect(tracker.accessed).toContain(sut.r1 as any)
        expect(tracker.accessed).toContain(sut.r2 as any)
    })

    test("when read by an observed derivation before handling an event, derivation isn't recalculated when the event fires again without changes", () => {
        let update = event<number>('update')
        using sut = createModel(() => ({
            first: reduce(0, 'first').on(update, (_, value) => value),
            later: reduce(0, 'later').on(update, (_, value) => value * 10), // Read by derivation before handling update
        }))
        let calculation = mock(() => sut.first.value + sut.later.value)
        let derivation = derive(calculation, 'derivation')
        derivation.subscribe(new MockObserver())
        update(1)
        calculation.mockClear()

        update(1)

        expect(calculation).not.toHaveBeenCalled()
    })

    test("when subscribed to a derivation that's stale, doesn't reduce the change from before subscribing", () => {
        let source = signal(1, 'source')
        let derivation = derive(() => source.value * 10, 'derivation')
        derivation.value // Calculated before the change, so it's stale rather than never calculated
        source.setValue(2)
        using sut = createModel(() => ({ reduction: reduce(0, 'reduction').on(derivation, (_, value) => value) }))

        expect(sut.reduction.value).toBe(0)
    })

    test("when two sources change in the same update, throws", () => {
        let update = event<number>('update')
        using _ = createModel(() => {
            let first = reduce(0, 'first').on(update, (_, value) => value)
            let second = reduce(0, 'second').on(update, (_, value) => value * 10)
            return { first, second, both: reduce(0, 'both').on(first, (_, value) => value).on(second, (_, value) => value) }
        })

        expect(() => update(1)).toThrow(SourcesChangedTogetherError)
    })

    test("when sources are filters of the same event and only one passes, reduces its change", () => {
        let update = event<number>('update')
        using sut = createModel(() => ({
            reduction: reduce(0, 'reduction')
                .on(update.filter(value => value > 0), (_, value) => value)
                .on(update.filter(value => value < 0), (_, value) => -value)
        }))

        update(-2)

        expect(sut.reduction.value).toBe(2)
    })

    test("when a reducer reads another of its sources that the same update changes, throws", () => {
        let update = event<number>('update')
        using _ = createModel(() => {
            let other = reduce(0, 'other')
            let sut = reduce(0, 'sut')
                .on(update, () => other.value) // Notified before other
                .on(other, (_, value) => value)
            other.on(update, (_, value) => value)
            return { other, sut }
        })

        expect(() => update(1)).toThrow(SourcesChangedTogetherError)
    })

    test("when given a new source while that source is notifying, doesn't reduce its change", () => {
        let first = event<number>('first')
        let second = event<number>('second')
        using sut = createModel(() => ({ reduction: reduce(0, 'reduction').on(first, (_, value) => value) }))
        first(1)
        using _ = createModel(() => ({
            adder: reduce(0, 'adder').on(second, count => {
                sut.reduction.on(second, (_, value) => value * 10)
                return count + 1
            })
        }))

        second(2)

        expect(sut.reduction.value).toBe(1)
    })

    test("when reducer returns an event, throws", () => {
        let eventValue = event('test event')
        let subject = signal('test', 'test')
        using sut = createModel(() => ({
            reduction: reduce(null as any, 'sut')
                .on(subject, () => eventValue)
        }))

        try {
            subject.setValue('foo')
            expect.unreachable("Should have thrown")
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError)
            expect((e as InvalidStateError).observable).toBe(sut.reduction)
            expect((e as InvalidStateError).value).toBe(eventValue)
        }
    })

    test("when reducer returns an events object, throws", () => {
        @events
        class Events { }
        let eventsValue = new Events()
        let subject = signal('test', 'test')
        using sut = createModel(() => ({
            reduction: reduce(null as any, 'sut')
                .on(subject, () => eventsValue)
        }))

        try {
            subject.setValue('foo')
            expect.unreachable("Should have thrown")
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError)
            expect((e as InvalidStateError).observable).toBe(sut.reduction)
            expect((e as InvalidStateError).value).toBe(eventsValue)
        }
    })
})
