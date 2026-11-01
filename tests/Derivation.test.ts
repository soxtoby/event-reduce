import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test"
import { createModel, derive, Effect, event, events, reduce, signal, type IDerivation, type IEvent, type IReduction, type ISignal } from "event-reduce"
import { InvalidStateError } from "event-reduce/lib/observable"
import { beginTransition, getUnderlyingObservable, SideEffectDuringReactionError } from "event-reduce/lib/tracking"
import { dispose } from "event-reduce/lib/utils"
import { MockObserver } from "./MockObserver"

describe("derive", () => {
    let sourceA: ISignal<string>
    let sourceB: ISignal<string>
    let calculation: Mock<() => string>
    let sut: IDerivation<string>

    beforeEach(() => {
        sourceA = signal('a', 'a')
        sourceB = signal('b', 'b')
        calculation = mock(() => sourceA.value + sourceB.value)
        sut = derive(calculation, 'sut')
    })

    test("has provided name", () => expect(sut.displayName).toBe('sut'))

    describe("when value accessed", () => {
        let result: string

        beforeEach(() => {
            result = sut.value
        })

        test("returns result of calculation", () => expect(result).toBe('ab'))

        test("derivation is last accessed value", () => expect(getUnderlyingObservable(result)!).toBe(sut))

        test("when accessed again, returns same value and doesn't re-compute the value", () => {
            let result2 = sut.value

            expect(result2).toBe(result)
            expect(calculation).toHaveBeenCalledTimes(1)
        })

        test("when an observable value changed then accessed again, returns updated value", () => {
            sourceB.setValue('B')

            let result2 = sut.value

            expect(result2).toBe('aB')
        })

        test("when multiple observable values changed then accessed again, returns updated value and re-computes only once", () => {
            calculation.mockClear()
            sourceA.setValue('A')
            sourceB.setValue('B')

            let result2 = sut.value

            expect(result2).toBe('AB')
            expect(calculation).toHaveBeenCalledTimes(1)
        })

        describe("when subscribed to", () => {
            let observer: MockObserver<string>

            beforeEach(() => {
                observer = new MockObserver()
                sut.subscribe(observer)
            })

            test("doesn't notify immediately", () => expect(observer.sourceUpdated).not.toHaveBeenCalled())

            test("when an observable value changed, notifies observer", () => {
                sourceA.setValue('A')

                expect(observer.sourceUpdated).toHaveBeenCalled()
            })
        })
    })

    test("when subscribed to before value accessed and an observable value changes, notifies observer", () => {
        let observer = new MockObserver<string>()
        sut.subscribe(observer)

        sourceA.setValue('A')

        expect(observer.sourceUpdated).toHaveBeenCalledWith(sut, 'Ab')
    })

    test("when derivation fires an event, throws", () => {
        let sideEffect = event('some event')
        let derivation = derive(() => sideEffect())

        try {
            derivation.value
            expect.unreachable("Should have thrown")
        } catch (e) {
            expect(e).toBeInstanceOf(SideEffectDuringReactionError)
            expect((e as SideEffectDuringReactionError).reactingTo).toBe(derivation)
            expect((e as SideEffectDuringReactionError).sideEffect).toBe(sideEffect)
        }
    })

    test("when derivation returns an event, accessing value throws", () => {
        let eventValue = event('derived event')
        let derivation = derive(() => sourceA.value && eventValue)

        try {
            derivation.value
            expect.unreachable("Should have thrown")
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError)
            expect((e as InvalidStateError).observable).toBe(derivation)
            expect((e as InvalidStateError).value).toBe(eventValue)
        }
    })

    test("when derivation returns an events class, accessing value throws", () => {
        @events
        class Events { }
        let eventsValue = new Events()
        let derivation = derive(() => sourceA.value && eventsValue)

        try {
            derivation.value
            expect.unreachable("Should have thrown")
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError)
            expect((e as InvalidStateError).observable).toBe(derivation)
            expect((e as InvalidStateError).value).toBe(eventsValue)
        }
    })
})

test("derivation that depends on other derivations only updates once", () => {
    let observable = signal("a", "Observable")
    let inner1 = derive(() => observable.value + "_inner1")
    let inner2 = derive(() => observable.value + "_inner2")
    let outerCalc = mock(() => inner1.value + inner2.value)
    let outer = derive(outerCalc)
    outer.subscribe(new MockObserver()) // Outer must be observed for sources to trigger an update

    // Initial access to set up dependencies
    outer.value
    expect(outerCalc).toHaveBeenCalledTimes(1)

    // This should trigger updates to inner1 and inner2, but outer should only re-calculate once
    observable.setValue("b")
    outer.value
    expect(outerCalc).toHaveBeenCalledTimes(2)
})

describe("derivation of an unobserved derivation of a reduction", () => {
    let increment: IEvent<number>
    let count: IReduction<number>
    let inner: IDerivation<number>
    let sut: IDerivation<number>

    beforeEach(() => {
        increment = event('increment')
        count = createModel(() => ({ count: reduce(0, 'count').on(increment, (current, amount) => current + amount) })).count
        inner = derive(() => count.value * 10, 'inner')
        sut = derive(() => inner.value + 1, 'sut')
        sut.value
    })

    test("when unobserved and reduction changes, returns updated value", () => {
        increment(1)

        expect(sut.value).toBe(11)
    })

    test("when unobserved and reduction changes twice, returns latest value", () => {
        increment(1)
        sut.value
        increment(2)

        expect(sut.value).toBe(31)
    })
})

test("observed derivation of a derivation, when one event updates reductions behind both of them, returns value from both updated reductions", () => {
    let update = event<number>('update')
    let [direct, indirect] = createModel(() => [
        reduce(0, 'direct').on(update, (_, value) => value),
        reduce(0, 'indirect').on(update, (_, value) => value * 10), // Notified after direct
    ])
    let inner = derive(() => indirect.value, 'inner')
    let sut = derive(() => direct.value + inner.value, 'sut')
    sut.subscribe(new MockObserver())
    render(() => inner.value) // Checked while observed, so inner relies on notifications from here

    update(1)

    expect(sut.value).toBe(11)
})

test("observed derivation of a reduction of a derivation, when one event updates reductions behind both of them, returns value from both updated reductions", () => {
    let update = event<number>('update')
    let [direct, indirect] = createModel(() => [
        reduce(0, 'direct').on(update, (_, value) => value),
        reduce(0, 'indirect').on(update, (_, value) => value * 10), // Notified after direct
    ])
    let inner = derive(() => indirect.value, 'inner')
    let { reduced } = createModel(() => ({ reduced: reduce(0, 'reduced').on(inner, (_, value) => value) }))
    let sut = derive(() => direct.value + reduced.value, 'sut')
    sut.subscribe(new MockObserver())

    update(1)

    expect(sut.value).toBe(11)
})

test("derivation observed by a reduction, when one event updates reductions behind it directly and through a mapped observable, only notifies reduction of value from both updated reductions", () => {
    let update = event<number>('update')
    let { direct } = createModel(() => ({ direct: reduce(0, 'direct').on(update, (_, value) => value) }))
    let { mapped } = createModel(() => ({ mapped: reduce(0, 'mapped').on(update.map(value => value * 10, 'tens'), (_, value) => value) })) // Mapped observable is notified after direct
    let inner = derive(() => mapped.value, 'inner')
    let sut = derive(() => direct.value + inner.value, 'sut')
    let { received } = createModel(() => ({ received: reduce([] as number[], 'received').on(sut, (values, value) => [...values, value]) }))

    update(1)

    expect(received.value).toEqual([11])
})

test("derivation, when source changes while unsubscribed and is then subscribed again, returns updated value", () => {
    let source = signal(1, 'source')
    let sut = derive(() => source.value * 2, 'sut')
    let observer = new MockObserver<number>()
    sut.subscribe(observer)
    sut.unsubscribe(observer)
    source.setValue(2)
    sut.subscribe(observer)

    let result = render(() => sut.value)

    expect(result).toBe(4)
})

test("derivation, when source changes while unsubscribed and is subscribed again after a render, returns updated value", () => {
    let source = signal(1, 'source')
    let sut = derive(() => source.value * 2, 'sut')
    let observer = new MockObserver<number>()
    sut.subscribe(observer)
    sut.unsubscribe(observer)
    source.setValue(2)
    render(() => { })
    sut.subscribe(observer)

    let result = render(() => sut.value)

    expect(result).toBe(4)
})

test("derivation calculated by a reducer, when an unobserved source's reduction handles the same event afterwards, returns updated value on next render", () => {
    let update = event<number>('update')
    let { first } = createModel(() => ({ first: reduce(0, 'first').on(update, (_, value) => value) }))
    createModel(() => ({ reader: reduce(0, 'reader').on(update, () => sut.value) }))
    let { late } = createModel(() => ({ late: reduce(0, 'late').on(update.map(value => value, 'mapped'), (_, value) => value) })) // Mapped observable is notified after reader
    let lazy = derive(() => late.value, 'lazy')
    let sut = derive(() => first.value + lazy.value, 'sut')
    sut.value

    update(5)

    expect(render(() => sut.value)).toBe(10)
})

test("derivation of a derivation of a derivation, when innermost value changes without changing middle value, doesn't recalculate", () => {
    let source = signal(1, 'source')
    let inner = derive(() => source.value, 'inner')
    let middle = derive(() => inner.value > 0, 'middle')
    let calculation = mock(() => middle.value)
    let sut = derive(calculation, 'sut')
    middle.value // Calculating middle first, so sut's first calculation checks middle's sources
    sut.value
    calculation.mockClear()

    source.setValue(2)
    sut.value

    expect(calculation).not.toHaveBeenCalled()
})

test("derivations with circular sources, when a source changes, don't recurse infinitely", () => {
    let source = signal(1, 'source')
    let b: IDerivation<number> | undefined
    let a = derive(() => (b?.value ?? 0) + source.value, 'a') // Reading b first, so b is checked for staleness before source
    b = derive(() => a.value, 'b')
    a.value
    source.setValue(2)

    expect(() => a.value).not.toThrow(RangeError)
})

// Reads in a new iteration without changing anything, like rendering a component does
function render<T>(read: () => T) {
    let renderEffect = new Effect('render', read, () => { })
    let transition = beginTransition(renderEffect, { trigger: 'render' })
    try {
        return renderEffect.run()
    } finally {
        transition[dispose]()
    }
}
