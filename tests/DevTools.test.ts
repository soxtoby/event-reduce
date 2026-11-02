import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, mock, test, type Mock } from "bun:test"
import { createModel, derive, enableDevTools, event, reduce, signal } from "event-reduce"
import { useReactive } from "event-reduce-react"

describe("enableDevTools", () => {
    let send: Mock<(action: any, state: unknown) => void>
    let disableDevTools: () => void

    beforeEach(() => {
        send = mock()
        ;(window as any).__REDUX_DEVTOOLS_EXTENSION__ = {
            connect: () => ({ init() { }, subscribe: () => () => { }, send })
        }
        disableDevTools = enableDevTools({})
    })

    afterEach(() => {
        disableDevTools()
        delete (window as any).__REDUX_DEVTOOLS_EXTENSION__
    })

    test("event sends its value, without changing it", () => {
        let model = createModel(() => {
            let changed = event<{ type: string }>('changed')
            return { changed, value: reduce('', changed).on(changed, (_, e) => e.type) }
        })
        let value = { type: 'eventType' }

        model.changed(value)

        expect(send).toHaveBeenCalledWith({ type: 'changed', '.type': 'eventType' }, expect.anything())
        expect(value).toEqual({ type: 'eventType' })
    })

    test("render triggered by a derivation sends the derivation's path", () => {
        let source = signal('initial', 'source')
        let derived = derive(() => source.value + '!', 'derived')
        renderHook(() => useReactive('rendered', () => derived.value))
        send.mockClear()

        act(() => source.setValue('changed'))

        expect(send).toHaveBeenCalledWith({ type: 'rendered', trigger: 'derived' }, expect.anything())
    })

    test("derivation triggered by a derivation sends the source derivation's path", () => {
        let source = signal('initial', 'source')
        let inner = derive(() => source.value + '!', 'inner')
        let outer = derive(() => inner.value + '?', 'outer')
        outer.value
        source.setValue('changed')
        send.mockClear()

        outer.value

        expect(send).toHaveBeenCalledWith({ type: 'outer', trigger: 'inner' }, expect.anything())
    })
})
