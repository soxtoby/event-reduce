import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { getUnderlyingSource, SideEffectDuringReactionError } from "event-reduce/src/signals/tracking";
import { Atom, derive, event, IDerivation } from "event-reduce/src/signals";
import { MockObserver } from "./MockObserver";
import { InvalidStateError } from "event-reduce/src/signals/signals";
import { events } from "event-reduce/src/signals/models";

describe("derive", () => {
    let sourceA: Atom<string>;
    let sourceB: Atom<string>;
    let calculation: Mock<() => string>;
    let sut: IDerivation<string>;

    beforeEach(() => {
        sourceA = new Atom('a', 'a');
        sourceB = new Atom('b', 'b');
        calculation = mock(() => sourceA.value + sourceB.value);
        sut = derive(calculation, 'sut');
    });

    test("has provided name", () => expect(sut.displayName).toBe('sut'));

    describe("when value accessed", () => {
        let result: string;

        beforeEach(() => {
            result = sut.value;
        });

        test("returns result of calculation", () => expect(result).toBe('ab'));

        test("derivation is last accessed value", () => expect(getUnderlyingSource(result)!).toBe(sut));

        test("when accessed again, returns same value and doesn't re-compute the value", () => {
            let result2 = sut.value;

            expect(result2).toBe(result);
            expect(calculation).toHaveBeenCalledTimes(1);
        });

        test("when a source value changed then accessed again, returns updated value", () => {
            sourceB.setValue('B');

            let result2 = sut.value;

            expect(result2).toBe('aB');
        });

        test("when multiple source values changed then accessed again, returns updated value and re-computes only once", () => {
            calculation.mockClear();
            sourceA.setValue('A');
            sourceB.setValue('B');

            let result2 = sut.value;

            expect(result2).toBe('AB');
            expect(calculation).toHaveBeenCalledTimes(1);
        });

        describe("when subscribed to", () => {
            let observer: MockObserver<string>;

            beforeEach(() => {
                observer = new MockObserver();
                sut.subscribe(observer);
            });

            test("doesn't notify immediately", () => expect(observer.sourceUpdated).not.toHaveBeenCalled());

            test("when a source value changed, notifies observer", () => {
                sourceA.setValue('A');

                expect(observer.sourceUpdated).toHaveBeenCalled();
            });
        });
    });

    test("when derivation fires an event, throws", () => {
        let sideEffect = event('some event');
        let derivation = derive(() => sideEffect());

        try {
            derivation.value;
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(SideEffectDuringReactionError);
            expect((e as SideEffectDuringReactionError).reactingTo).toBe(derivation);
            expect((e as SideEffectDuringReactionError).sideEffect).toBe(sideEffect);
        }
    });

    test("when derivation returns an event, accessing value throws", () => {
        let eventValue = event('derived event')
        let derivation = derive(() => sourceA.value && eventValue);

        try {
            derivation.value;
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError);
            expect((e as InvalidStateError).source).toBe(derivation);
            expect((e as InvalidStateError).value).toBe(eventValue);
        }
    });

    test("when derivation returns an events class, accessing value throws", () => {
        @events
        class Events { }
        let eventsValue = new Events();
        let derivation = derive(() => sourceA.value && eventsValue);

        try {
            derivation.value;
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidStateError);
            expect((e as InvalidStateError).source).toBe(derivation);
            expect((e as InvalidStateError).value).toBe(eventsValue);
        }
    });
});

test("derivation that depends on other derivations only updates once", () => {
    let source = new Atom("source", "a");
    let inner1 = derive(() => source.value + "_inner1");
    let inner2 = derive(() => source.value + "_inner2");
    let outerCalc = mock(() => inner1.value + inner2.value);
    let outer = derive(outerCalc);
    outer.subscribe(new MockObserver()); // Outer must be observed for sources to trigger an update

    // Initial access to set up dependencies
    outer.value;
    expect(outerCalc).toHaveBeenCalledTimes(1);

    // This should trigger updates to inner1 and inner2, but outer should only re-calculate once
    source.setValue("b");
    outer.value;
    expect(outerCalc).toHaveBeenCalledTimes(2);
});