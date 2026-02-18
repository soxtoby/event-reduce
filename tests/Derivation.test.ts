import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { derive, event, events } from "event-reduce";
import { DerivedEventsError, SideEffectInDerivationError } from "event-reduce/lib/derivation";
import { consumeLastAccessed, ObservableValue } from "event-reduce/lib/observableValue";

describe("derive", () => {
    let sourceA: ObservableValue<string>;
    let sourceB: ObservableValue<string>;
    let calculation: Mock<() => string>;
    let sut: ReturnType<typeof derive<string>>;

    beforeEach(() => {
        sourceA = new ObservableValue(() => 'a', 'a');
        sourceB = new ObservableValue(() => 'b', 'b');
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

        test("derivation is last accessed value", () => expect(consumeLastAccessed()!).toBe(sut));

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
            let observe: Mock<(value: string) => void>;

            beforeEach(() => {
                observe = mock();
                sut.subscribe(observe);
            });

            test("doesn't notify immediately", () => expect(observe).not.toHaveBeenCalled());

            test("when a source value changed, notifies observer", () => {
                sourceA.setValue('A');

                expect(observe).toHaveBeenCalled();
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
            expect(e).toBeInstanceOf(SideEffectInDerivationError);
            expect((e as SideEffectInDerivationError).derivation).toBe(derivation);
            expect((e as SideEffectInDerivationError).sideEffect).toBe('some event');
        }
    });

    test("when derivation returns an event, accessing value throws", () => {
        let eventValue = event('derived event');
        let derivation = derive(() => sourceA.value && eventValue);

        try {
            derivation.value;
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(DerivedEventsError);
            expect((e as DerivedEventsError).derivation).toBe(derivation);
            expect((e as DerivedEventsError).value).toBe(eventValue);
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
            expect(e).toBeInstanceOf(DerivedEventsError);
            expect((e as DerivedEventsError).derivation).toBe(derivation);
            expect((e as DerivedEventsError).value).toBe(eventsValue);
        }
    });
});

test("derivation that depends on other derivations only updates once", () => {
    let source = new ObservableValue(() => "source", "a");
    let inner1 = derive(() => source.value + "_inner1");
    let inner2 = derive(() => source.value + "_inner2");
    let outerCalc = mock(() => inner1.value + inner2.value);
    let outer = derive(outerCalc);
    outer.subscribe(() => { }); // Outer must be observed for sources to trigger an update

    // Initial access to set up dependencies
    outer.value;
    expect(outerCalc).toHaveBeenCalledTimes(1);

    // This should trigger updates to inner1 and inner2, but outer should only re-calculate once
    source.setValue("b");
    outer.value;
    expect(outerCalc).toHaveBeenCalledTimes(2);
});