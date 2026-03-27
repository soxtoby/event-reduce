import { renderHook, RenderHookResult } from "@testing-library/react-hooks/dom";
import { beforeEach, describe, expect, test } from "bun:test";
import { useAsyncEvent, useDerived, useEvent, useReduced } from "event-reduce-react/signals";
import { event, IEvent, model, reduce, reduced, type AsyncResult } from "event-reduce/signals";
import { mutable } from "event-reduce/signals/testing";
import { IDerivation } from "event-reduce/signals";
import { MockObserver } from "./MockObserver";

describe("useEvent", () => {
    let sut: ReturnType<typeof renderHook<unknown, ReturnType<typeof useEvent<number>>>>;
    let initialResult: IEvent<number>

    beforeEach(() => {
        sut = renderHook(() => useEvent<number>());
        initialResult = sut.result.current;
    });

    test("returns an event", () => {
        let eventSpy = new MockObserver<number>()
        initialResult.subscribe(eventSpy);

        initialResult(3);

        expect(eventSpy.sourceUpdated).toHaveBeenCalledWith(initialResult, 3);
    });

    test("when rendered again, returns the same event instance", () => {
        sut.rerender();

        expect(sut.result.current).toBe(initialResult);
    });
});

describe("useAsyncEvent", () => {
    let sut: ReturnType<typeof renderHook<unknown, ReturnType<typeof useAsyncEvent<number>>>>;
    let initialResult: ReturnType<typeof useAsyncEvent<number>>;

    beforeEach(() => {
        sut = renderHook(() => useAsyncEvent<number>());
        initialResult = sut.result.current;
    });

    test("returns an async event", async () => {
        let eventSpy = new MockObserver<AsyncResult<number>>()
        initialResult.resolved.subscribe(eventSpy);

        let promise = Promise.resolve(3);
        initialResult(promise);
        await promise;

        expect(eventSpy.sourceUpdated).toHaveBeenCalledWith(initialResult.resolved, expect.objectContaining({ result: 3 }));
    });

    test("when rendered again, returns the same event instance", () => {
        sut.rerender();

        expect(sut.result.current).toBe(initialResult);
    });
});

describe("useDerived", () => {
    @model class SourceModel { @reduced get value() { return reduce(1).value; } }
    let source: ReturnType<typeof mutable<SourceModel>>;
    let sut: RenderHookResult<unknown, IDerivation<number>>
    let initialResult: IDerivation<number>

    beforeEach(() => {
        source = mutable(new SourceModel());
        sut = renderHook(() => useDerived(() => source.value * 2));
        initialResult = sut.result.current;
    });

    test("returns a derivation", () => {
        expect(initialResult.value).toBe(2);

        source.value = 3;

        expect(initialResult.value).toBe(6);
    });

    test("when rendered again, returns the same derivation instance", () => {
        sut.rerender();

        expect(sut.result.current).toBe(initialResult);
    });
});

describe("useReduced", () => {
    let added: ReturnType<typeof event<number>>;
    let sut: ReturnType<typeof renderHook<unknown, ReturnType<typeof useReduced<number>>>>;
    let initialResult: ReturnType<typeof useReduced<number>>;

    beforeEach(() => {
        added = event<number>();
        sut = renderHook(() => useReduced(1)
            .on(added, (current, addedVal) => current + addedVal));
        initialResult = sut.result.current;
    });

    test("returns a reduction", () => {
        expect(initialResult.value).toBe(1);

        added(2);

        expect(initialResult.value).toBe(3);
    });

    test("when rendered again, returns the same reduction instance", () => {
        sut.rerender();

        expect(sut.result.current).toBe(initialResult);
    });
});
