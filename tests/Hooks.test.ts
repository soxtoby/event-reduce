import { describe, test, expect, beforeEach } from "bun:test";
import { renderHook } from "@testing-library/react-hooks";
import { event, model, reduce, reduced } from "event-reduce";
import { useAsyncEvent, useDerived, useEvent, useReduced } from "event-reduce-react";
import { mutable } from "event-reduce/lib/testing";
import { match, spy } from "sinon";
import { SynchronousPromise } from "synchronous-promise";

describe(useEvent.name, () => {
    let sut: ReturnType<typeof renderHook<unknown, ReturnType<typeof useEvent<number>>>>;
    let initialResult: ReturnType<typeof useEvent<number>>;

    beforeEach(() => {
        sut = renderHook(() => useEvent<number>());
        initialResult = sut.result.current;
    });

    test("returns an event", () => {
        let eventSpy = spy();
        initialResult.subscribe(eventSpy);

        initialResult(3);

        expect(eventSpy.calledWith(3)).toBe(true);
    });

    describe("when rendered again", () => {
        beforeEach(() => {
            sut.rerender();
        });

        test("returns the same event instance", () => expect(sut.result.current).toBe(initialResult));
    });
});

describe(useAsyncEvent.name, () => {
    let sut: ReturnType<typeof renderHook<unknown, ReturnType<typeof useAsyncEvent<number>>>>;
    let initialResult: ReturnType<typeof useAsyncEvent<number>>;

    beforeEach(() => {
        sut = renderHook(() => useAsyncEvent<number>());
        initialResult = sut.result.current;
    });

    test("returns an async event", () => {
        let eventSpy = spy();
        initialResult.resolved.subscribe(eventSpy);

        initialResult(SynchronousPromise.resolve(3));

        expect(eventSpy.calledWith(match({ result: 3 }))).toBe(true);
    });

    describe("when rendered again", () => {
        beforeEach(() => {
            sut.rerender();
        });

        test("returns the same event instance", () => expect(sut.result.current).toBe(initialResult));
    });
});

describe(useDerived.name, () => {
    @model class SourceModel { @reduced accessor value = reduce(1).value; }
    let source: ReturnType<typeof mutable<SourceModel>>;
    let sut: ReturnType<typeof renderHook<unknown, ReturnType<typeof useDerived<number>>>>;
    let initialResult: ReturnType<typeof useDerived<number>>;

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

    describe("when rendered again", () => {
        beforeEach(() => {
            sut.rerender();
        });

        test("returns the same derivation instance", () => expect(sut.result.current).toBe(initialResult));
    });
});

describe(useReduced.name, () => {
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

    describe("when rendered again", () => {
        beforeEach(() => {
            sut.rerender();
        });

        test("returns the same reduction instance", () => expect(sut.result.current).toBe(initialResult));
    });
});