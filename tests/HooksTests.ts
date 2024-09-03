import { renderHook } from "@testing-library/react-hooks";
import { event, reduce, reduced } from "event-reduce";
import { useAsyncEvent, useDerived, useEvent, useReduced } from "event-reduce-react";
import { mutable } from "event-reduce/lib/testing";
import { match, spy } from "sinon";
import { SynchronousPromise } from "synchronous-promise";
import { describe, it, when } from "wattle";

describe(useEvent.name, function () {
    let sut = renderHook(() => useEvent<number>());

    let initialResult = sut.result.current;

    it("returns an event", () => {
        let eventSpy = spy();
        initialResult.subscribe(eventSpy);

        initialResult(3);

        eventSpy.should.have.been.calledWith(3);
    });

    when("rendered again", () => {
        sut.rerender();

        it("returns the same event instance", () => sut.result.current.should.equal(initialResult));
    });
});

describe(useAsyncEvent.name, function () {
    let sut = renderHook(() => useAsyncEvent<number>());

    let initialResult = sut.result.current;

    it("returns an async event", () => {
        let eventSpy = spy();
        initialResult.resolved.subscribe(eventSpy);

        initialResult(SynchronousPromise.resolve(3));

        eventSpy.should.have.been.calledWith(match({ result: 3 }));
    });

    when("rendered again", () => {
        sut.rerender();

        it("returns the same event instance", () => sut.result.current.should.equal(initialResult));
    });
});

describe(useDerived.name, function () {
    class SourceModel { @reduced value = reduce(1).value; }
    let source = mutable(new SourceModel());
    let sut = renderHook(() => useDerived(() => source.value * 2));

    let initialResult = sut.result.current;

    it("returns a derivation", () => {
        initialResult.value.should.equal(2);

        source.value = 3;

        initialResult.value.should.equal(6);
    });

    when("rendered again", () => {
        sut.rerender();

        it("returns the same derivation instance", () => sut.result.current.should.equal(initialResult));
    });
});

describe(useReduced.name, function () {
    let added = event<number>();
    let sut = renderHook(() => useReduced(1)
        .on(added, (current, added) => current + added));

    let initialResult = sut.result.current;

    it("returns a reduction", () => {
        initialResult.value.should.equal(1);

        added(2);

        initialResult.value.should.equal(3);
    });

    when("rendered again", () => {
        sut.rerender();

        it("returns the same reduction instance", () => sut.result.current.should.equal(initialResult));
    });
});