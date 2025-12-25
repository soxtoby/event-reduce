import { describe, test, expect, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react-hooks";
import { useReactive } from "event-reduce-react";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { spy } from "sinon";

describe('useReactive', () => {
    let observableValue: ObservableValue<string>;
    let innerBehaviour: () => void;
    let render: sinon.SinonSpy;
    let sut: ReturnType<typeof renderHook<unknown, string>>;

    beforeEach(() => {
        observableValue = new ObservableValue(() => 'test value', 'initial value');
        innerBehaviour = () => { };
        render = spy(() => {
            innerBehaviour();
            return observableValue.value;
        });
        sut = renderHook(() => useReactive(render));
    });

    test("render function called immediately", () => expect(render.callCount).toBe(1));

    test("returns result of render function", () => expect(sut.result.current).toBe('initial value'));

    describe("when re-rendered", () => {
        beforeEach(() => {
            sut.rerender();
        });

        test("render function called again", () => expect(render.callCount).toBe(2)); // In case render function uses hooks
    });

    describe("when accessed observable value changed", () => {
        beforeEach(() => {
            act(() => observableValue.setValue('new value'));
        });

        test("render function called again", () => expect(render.callCount).toBe(2));

        test("returns updated result", () => expect(sut.result.current).toBe('new value'));
    });

    describe("when accessed observable value is changed during render", () => {
        beforeEach(() => {
            innerBehaviour = () => observableValue.setValue('new value');
            render.resetHistory();
            sut.rerender();
        });

        test("doesn't trigger an extra render", () => expect(render.callCount).toBe(1));
    });
});