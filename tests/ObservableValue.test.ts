import { beforeEach, describe, expect, test } from "bun:test"
import { ISignal, signal } from "event-reduce"
import { getUnderlyingObservable } from "event-reduce/lib/tracking"
import { MockObserver } from "./MockObserver"

describe("signal", () => {
    let sut: ISignal<string>
    let observer: MockObserver<string>

    beforeEach(() => {
        sut = signal('initial', 'sut')
        observer = new MockObserver()
        sut.subscribe(observer)
    })

    describe("when value accessed", () => {
        let result: string

        beforeEach(() => {
            result = sut.value
        })

        test("returns provided value", () => expect(result).toBe('initial'))

        test("tracks the accessed observable", () => expect(getUnderlyingObservable(result)).toBe(sut))
    })

    describe("when value changed", () => {
        beforeEach(() => {
            sut.setValue('different')
        })

        test("updates the value", () => expect(sut.value).toBe('different'))

        test("notifies observers", () => expect(observer.sourceUpdated).toHaveBeenCalledWith(sut, 'different'))
    })

    test("when value set to same value, observers are notified", () => {
        sut.setValue('initial')

        expect(observer.sourceUpdated).toHaveBeenCalledWith(sut, 'initial')
    })
})