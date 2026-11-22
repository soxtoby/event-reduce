import { act, render, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test"
import { ISignal, signal } from "event-reduce"
import { reactive, useReactive } from "event-reduce-react"
import { createElement } from "react"

describe('useReactive', () => {
    let observable: ISignal<string>
    let innerBehaviour: () => void
    let render: Mock<() => string>
    let sut: ReturnType<typeof renderHook<unknown, string>>

    beforeEach(() => {
        observable = signal('initial value', 'test value')
        innerBehaviour = () => { }
        render = mock(() => {
            innerBehaviour()
            return observable.value
        })
        sut = renderHook(() => useReactive(render))
    })

    test("render function called immediately", () => expect(render).toHaveBeenCalledTimes(1))

    test("returns result of render function", () => expect(sut.result.current).toBe('initial value'))

    test("when re-rendered, render function called again", () => {
        sut.rerender()

        expect(render).toHaveBeenCalledTimes(2) // In case render function uses hooks
    })

    describe("when accessed observable value changed", () => {
        beforeEach(() => {
            act(() => observable.setValue('new value'))
        })

        test("render function called again", () => expect(render).toHaveBeenCalledTimes(2))

        test("returns updated result", () => expect(sut.result.current).toBe('new value'))
    })
})

test("reactive component using useReactive updates when either signal changes", () => {
    let inner = signal("inner")
    let outer = signal("outer")
    let Component = reactive(() => {
        let value = useReactive(() => inner.value)
        return createElement("span", null, value + "/" + outer.value)
    })    
    let sut = render(createElement(Component))
    
    expect(sut.container.textContent).toBe("inner/outer")

    act(() => inner.setValue("changed"))
    expect(sut.container.textContent).toBe("changed/outer")

    act(() => outer.setValue("updated"))
    expect(sut.container.textContent).toBe("changed/updated")
})
