import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { ISignal, signal } from "event-reduce";
import { useReactive } from "event-reduce-react";

describe('useReactive', () => {
    let observable: ISignal<string>;
    let innerBehaviour: () => void;
    let render: Mock<() => string>;
    let sut: ReturnType<typeof renderHook<unknown, string>>;

    beforeEach(() => {
        observable = signal('initial value', 'test value');
        innerBehaviour = () => { };
        render = mock(() => {
            innerBehaviour();
            return observable.value;
        });
        sut = renderHook(() => useReactive(render));
    });

    test("render function called immediately", () => expect(render).toHaveBeenCalledTimes(1));

    test("returns result of render function", () => expect(sut.result.current).toBe('initial value'));

    test("when re-rendered, render function called again", () => {
        sut.rerender();

        expect(render).toHaveBeenCalledTimes(2); // In case render function uses hooks
    });

    describe("when accessed observable value changed", () => {
        beforeEach(() => {
            act(() => observable.setValue('new value'));
        });

        test("render function called again", () => expect(render).toHaveBeenCalledTimes(2));

        test("returns updated result", () => expect(sut.result.current).toBe('new value'));
    });
});
