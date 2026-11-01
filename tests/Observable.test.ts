import { beforeEach, describe, expect, test } from "bun:test"
import { createModel, derive, event, IReduction, ISignal, merge, reduce, signal, type IObservable } from "event-reduce"
import { SourcesChangedTogetherError } from "event-reduce/lib/observable"
import { MockObserver } from "./MockObserver"

describe("Observable", () => {
    let sut: ISignal<string>
    let observer: MockObserver<string>

    beforeEach(() => {
        sut = signal('initial', 'sut')
        observer = new MockObserver()
        sut.subscribe(observer)
    })

    test("when updated, notifies subscribed observers", () => {
        sut.setValue('updated')

        expect(observer.sourceUpdated).toHaveBeenCalledWith(sut, 'updated')
    })

    test("when unsubscribed, stops notifying observer", () => {
        sut.unsubscribe(observer)

        sut.setValue('updated')

        expect(observer.sourceUpdated).not.toHaveBeenCalled()
    })

    test("when an observer unsubscribes another while notifying, doesn't notify the unsubscribed observer", () => {
        let later = new MockObserver<string>()
        sut.subscribe({ displayName: 'unsubscriber', sourceUpdated: () => sut.unsubscribe(later) })
        sut.subscribe(later)

        sut.setValue('updated')

        expect(later.sourceUpdated).not.toHaveBeenCalled()
    })

    test("map", () => {
        let mapped = sut.map(value => value.toUpperCase())
        let observed = values(mapped)

        sut.setValue('a')
        sut.setValue('b')

        expect(observed).toEqual(['A', 'B'])
    })

    test("map, when read by an earlier observer of the same observable, notifies its observers once with mapped value", () => {
        let mappedReduction: IReduction<string>
        let { read } = createModel(() => ({
            read: reduce([] as string[], 'read')
                .on(sut, values => [...values, mappedReduction.value]) // Notified before mapped observable
        }))
        let mapped = sut.map(value => value.toUpperCase())
        mappedReduction = createModel(() => ({
            mappedReduction: reduce('', 'mapped reduction')
                .on(mapped, (_, value) => value)
        })).mappedReduction
        let observed = values(mapped)

        sut.setValue('a')

        expect(read.value).toEqual(['A'])
        expect(observed).toEqual(['A'])
    })

    test("map of a reduction, when read by an earlier observer of the reduction's event, notifies its observers with the reduction's new value", () => {
        let update = event<string>('update')
        let mappedReduction: IReduction<string>
        let { read } = createModel(() => ({ read: reduce([] as string[], 'read').on(update, values => [...values, mappedReduction.value]) })) // Notified before source reduction
        let { source } = createModel(() => ({ source: reduce('', 'source').on(update, (_, value) => value) }))
        let mapped = source.map(value => value.toUpperCase())
        mappedReduction = createModel(() => ({ mappedReduction: reduce('', 'mapped reduction').on(mapped, (_, value) => value) })).mappedReduction

        update('a')

        expect(read.value).toEqual(['A'])
    })

    test("map, when subscribed while its source is notifying, doesn't forward the change", () => {
        let update = event<number>('update')
        let { parent } = createModel(() => ({
            parent: reduce(null as { mapped: IReduction<number> } | null, 'parent')
                .on(update, () => createModel(() => ({ mapped: reduce(0, 'mapped').on(update.map(value => value * 10), (_, value) => value) })))
        }))

        update(1)

        expect(parent.value!.mapped.value).toBe(0)
    })

    test("map, when reduced after source changed, doesn't forward earlier change", () => {
        sut.setValue('a')

        let { result } = createModel(() => ({ result: reduce('', 'result').on(sut.map(value => value.toUpperCase()), (_, value) => value) }))

        expect(result.value).toBe('')
    })

    test("map of a derivation, when reduced while the derivation is stale, doesn't forward the change from before subscribing", () => {
        let source = signal(1, 'source')
        let derivation = derive(() => source.value * 10, 'derivation')
        derivation.value // Calculated before the change, so it's stale rather than never calculated
        source.setValue(2)

        let { result } = createModel(() => ({ result: reduce(0, 'result').on(derivation.map(value => value + 1), (_, value) => value) }))

        expect(result.value).toBe(0)
    })

    test("merge, when two of its sources change in the same update, throws", () => {
        let update = event<number>('update')
        let [first, second] = createModel(() => [
            reduce(0, 'first').on(update, (_, value) => value),
            reduce(0, 'second').on(update, (_, value) => value * 10),
        ])
        let merged = merge([first, second])
        values(merged)

        expect(() => update(1)).toThrow(SourcesChangedTogetherError)
    })

    test("merge, when its sources are filters of the same event and only one passes, forwards its change", () => {
        let update = event<number>('update')
        let merged = merge([update.filter(value => value > 0), update.filter(value => value < 0)])
        let observed = values(merged)

        update(1)

        expect(observed).toEqual([1])
    })

    test("merge, when subscribed again while a different source to the last one forwarded is notifying, doesn't forward the change", () => {
        let first = event<number>('first')
        let second = event<number>('second')
        let merged = merge([first, second])
        let observer = new MockObserver<number>()
        merged.subscribe(observer)
        first(1)
        merged.unsubscribe(observer)
        let { parent } = createModel(() => ({
            parent: reduce(null as { result: IReduction<number> } | null, 'parent')
                .on(second, () => createModel(() => ({ result: reduce(0, 'result').on(merged, (_, value) => value) })))
        }))

        second(2)

        expect(parent.value!.result.value).toBe(0)
    })

    test("filter", () => {
        let filtered = sut.filter(value => value.length > 1)
        let observed = values(filtered)

        sut.setValue('a')
        sut.setValue('bb')
        sut.setValue('ccc')

        expect(observed).toEqual(['bb', 'ccc'])
    })

    test("filterMap", () => {
        let filtered = sut.filterMap(value => value.length > 1 ? value.length : undefined)
        let observed = values(filtered)

        sut.setValue('a')
        sut.setValue('bb')
        sut.setValue('cccc')

        expect(observed).toEqual([2, 4])
    })

    function values<T>(observable: IObservable<T>) {
        let observed: T[] = []
        observable.subscribe({
            displayName: 'value collector',
            sourceUpdated: (_, value) => observed.push(value)
        })
        return observed
    }
})