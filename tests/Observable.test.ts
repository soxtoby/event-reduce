import { beforeEach, describe, expect, test } from "bun:test"
import { ISignal, signal, type IObservable } from "event-reduce"
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

    test("map", () => {
        let mapped = sut.map(value => value.toUpperCase())
        let observed = values(mapped)

        sut.setValue('a')
        sut.setValue('b')

        expect(observed).toEqual(['A', 'B'])
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