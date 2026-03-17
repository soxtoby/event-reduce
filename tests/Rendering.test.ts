import { act, renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { useReactive } from "event-reduce-react/src/signals";
import { Atom } from "event-reduce/lib/signals";

describe('useReactive', () => {
    let source: Atom<string>;
    let innerBehaviour: () => void;
    let render: Mock<() => string>;
    let sut: ReturnType<typeof renderHook<unknown, string>>;

    beforeEach(() => {
        source = new Atom<string>('test value', 'initial value');
        innerBehaviour = () => { };
        render = mock(() => {
            innerBehaviour();
            return source.value;
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
            act(() => source.setValue('new value'));
        });

        test("render function called again", () => expect(render).toHaveBeenCalledTimes(2));

        test("returns updated result", () => expect(sut.result.current).toBe('new value'));
    });

    test("when accessed observable value is changed during render, doesn't trigger an extra render", () => {
        innerBehaviour = () => source.setValue('new value');
        render.mockClear();
        sut.rerender();

        expect(render).toHaveBeenCalledTimes(1);
    });
});