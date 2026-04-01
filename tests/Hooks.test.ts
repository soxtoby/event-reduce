import { renderHook, RenderHookResult } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "bun:test";
import { useAsyncEvent, useDerived, useEvent, useReduced } from "event-reduce-react";
import { event, IEvent, model, reduce, reduced, type AsyncResult } from "event-reduce";
import { mutable } from "event-reduce/lib/testing";
import { IDerivation } from "event-reduce";
import { MockObserver } from "./MockObserver";

describe("useEvent", () => {
    let sut: RenderHookResult<ReturnType<typeof useEvent<number>>, unknown>;
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
    let sut: RenderHookResult<ReturnType<typeof useAsyncEvent<number>>, unknown>;
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
    let sut: RenderHookResult<IDerivation<number>, unknown>
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
    let sut: RenderHookResult<ReturnType<typeof useReduced<number>>, unknown>;
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
