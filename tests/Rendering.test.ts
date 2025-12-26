import { act, renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { useReactive } from "event-reduce-react";
import { ObservableValue } from "event-reduce/lib/observableValue";

describe('useReactive', () => {
    let observableValue: ObservableValue<string>;
    let innerBehaviour: () => void;
    let render: Mock<() => string>;
    let sut: ReturnType<typeof renderHook<unknown, string>>;

    beforeEach(() => {
        observableValue = new ObservableValue(() => 'test value', 'initial value');
        innerBehaviour = () => { };
        render = mock(() => {
            innerBehaviour();
            return observableValue.value;
        });
        sut = renderHook(() => useReactive(render));
    });

    test("render function called immediately", () => expect(render).toHaveBeenCalledTimes(1));

    test("returns result of render function", () => expect(sut.result.current).toBe('initial value'));

    describe("when re-rendered", () => {
        beforeEach(() => {
            sut.rerender();
        });

        test("render function called again", () => expect(render).toHaveBeenCalledTimes(2)); // In case render function uses hooks
    });

    describe("when accessed observable value changed", () => {
        beforeEach(() => {
            act(() => observableValue.setValue('new value'));
        });

        test("render function called again", () => expect(render).toHaveBeenCalledTimes(2));

        test("returns updated result", () => expect(sut.result.current).toBe('new value'));
    });

    describe("when accessed observable value is changed during render", () => {
        beforeEach(() => {
            innerBehaviour = () => observableValue.setValue('new value');
            render.mockClear();
            sut.rerender();
        });

        test("doesn't trigger an extra render", () => expect(render).toHaveBeenCalledTimes(1));
    });
});