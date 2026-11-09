import { renderHook, RenderHookResult } from "@testing-library/react"
import { beforeEach, describe, expect, test } from "bun:test"
import { useAsyncEvent, useDerived, useEvent, useModel, useReduced } from "event-reduce-react"
import { event, IEvent, model, reduce, reduced, type AsyncResult } from "event-reduce"
import { Activity, createElement, type ReactNode, StrictMode } from "react"
import { mutable } from "event-reduce/lib/testing"
import { IDerivation } from "event-reduce"
import { MockObserver } from "./MockObserver"

describe("useModel", () => {
    let added: ReturnType<typeof event<number>>
    @model class CounterModel { @reduced get count() { return reduce(1).on(added, (current, addedVal) => current + addedVal).value } }

    beforeEach(() => {
        added = event<number>()
    })

    test("returns a model that updates", () => {
        let sut = renderHook(() => useModel(() => new CounterModel()))

        added(2)

        expect(sut.result.current.count).toBe(3)
    })

    test("in strict mode, returns a model that updates", () => {
        let sut = renderHook(() => useModel(() => new CounterModel()), { wrapper: StrictMode })

        added(2)

        expect(sut.result.current.count).toBe(3)
    })

    test("when rendered again, returns the same model instance", () => {
        let sut = renderHook(() => useModel(() => new CounterModel()))
        let initialResult = sut.result.current

        sut.rerender()

        expect(sut.result.current).toBe(initialResult)
    })

    test("when dependencies change, returns a new model and disposes the old one", () => {
        let sut = renderHook(({ key }) => useModel(() => new CounterModel(), [key]), { initialProps: { key: 1 } })
        let initialResult = sut.result.current

        sut.rerender({ key: 2 })
        added(2)

        expect(sut.result.current).not.toBe(initialResult)
        expect(sut.result.current.count).toBe(3)
        expect(initialResult.count).toBe(1)
    })

    test("when unmounted, disposes the model", () => {
        let sut = renderHook(() => useModel(() => new CounterModel()))
        let result = sut.result.current

        sut.unmount()
        added(2)

        expect(result.count).toBe(1)
    })

    test("when hidden and shown again by an activity, returns a model that updates", () => {
        let mode: 'visible' | 'hidden' = 'visible'
        let sut = renderHook(() => useModel(() => new CounterModel()), {
            wrapper: ({ children }: { children: ReactNode }) => createElement(Activity, { mode, children })
        })

        mode = 'hidden'
        sut.rerender()
        mode = 'visible'
        sut.rerender()
        added(2)

        expect(sut.result.current.count).toBe(3)
    })
})

describe("useEvent", () => {
    let sut: RenderHookResult<ReturnType<typeof useEvent<number>>, unknown>
    let initialResult: IEvent<number>

    beforeEach(() => {
        sut = renderHook(() => useEvent<number>())
        initialResult = sut.result.current
    })

    test("returns an event", () => {
        let eventSpy = new MockObserver<number>()
        initialResult.subscribe(eventSpy)

        initialResult(3)

        expect(eventSpy.sourceUpdated).toHaveBeenCalledWith(initialResult, 3)
    })

    test("when rendered again, returns the same event instance", () => {
        sut.rerender()

        expect(sut.result.current).toBe(initialResult)
    })
})

describe("useAsyncEvent", () => {
    let sut: RenderHookResult<ReturnType<typeof useAsyncEvent<number>>, unknown>
    let initialResult: ReturnType<typeof useAsyncEvent<number>>

    beforeEach(() => {
        sut = renderHook(() => useAsyncEvent<number>())
        initialResult = sut.result.current
    })

    test("returns an async event", async () => {
        let eventSpy = new MockObserver<AsyncResult<number>>()
        initialResult.resolved.subscribe(eventSpy)

        let promise = Promise.resolve(3)
        initialResult(promise)
        await promise

        expect(eventSpy.sourceUpdated).toHaveBeenCalledWith(initialResult.resolved, expect.objectContaining({ result: 3 }))
    })

    test("when rendered again, returns the same event instance", () => {
        sut.rerender()

        expect(sut.result.current).toBe(initialResult)
    })
})

describe("useDerived", () => {
    @model class SourceModel { @reduced get value() { return reduce(1).value } }
    let observable: ReturnType<typeof mutable<SourceModel>>
    let sut: RenderHookResult<IDerivation<number>, unknown>
    let initialResult: IDerivation<number>

    beforeEach(() => {
        observable = mutable(new SourceModel())
        sut = renderHook(() => useDerived(() => observable.value * 2))
        initialResult = sut.result.current
    })

    test("returns a derivation", () => {
        expect(initialResult.value).toBe(2)

        observable.value = 3

        expect(initialResult.value).toBe(6)
    })

    test("when rendered again, returns the same derivation instance", () => {
        sut.rerender()

        expect(sut.result.current).toBe(initialResult)
    })
})

describe("useReduced", () => {
    let added: ReturnType<typeof event<number>>
    let sut: RenderHookResult<ReturnType<typeof useReduced<number>>, unknown>
    let initialResult: ReturnType<typeof useReduced<number>>

    beforeEach(() => {
        added = event<number>()
        sut = renderHook(() => useReduced(1)
            .on(added, (current, addedVal) => current + addedVal))
        initialResult = sut.result.current
    })

    test("returns a reduction", () => {
        expect(initialResult.value).toBe(1)

        added(2)

        expect(initialResult.value).toBe(3)
    })

    test("when rendered again, returns the same reduction instance", () => {
        sut.rerender()

        expect(sut.result.current).toBe(initialResult)
    })

    test("in strict mode, returns a reduction that updates", () => {
        let strictSut = renderHook(() => useReduced(1)
            .on(added, (current, addedVal) => current + addedVal), { wrapper: StrictMode })

        added(2)

        expect(strictSut.result.current.value).toBe(3)
    })
})
