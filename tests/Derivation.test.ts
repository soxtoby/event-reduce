import { describe, test, expect, beforeEach } from "bun:test";
import { derive, event, events } from "event-reduce";
import { DerivedEventsError, SideEffectInDerivationError } from "event-reduce/lib/derivation";
import { consumeLastAccessed, ObservableValue } from "event-reduce/lib/observableValue";
import { spy, stub } from "sinon";

describe(derive.name, () => {
    let sourceA: ObservableValue<string>;
    let sourceB: ObservableValue<string>;
    let calculation: sinon.SinonSpy;
    let sut: ReturnType<typeof derive<string>>;

    beforeEach(() => {
        sourceA = new ObservableValue(() => 'a', 'a');
        sourceB = new ObservableValue(() => 'b', 'b');
        calculation = spy(() => sourceA.value + sourceB.value);
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

        describe("when accessed again", () => {
            let result2: string;

            beforeEach(() => {
                result2 = sut.value;
            });

            test("returns same value", () => expect(result2).toBe(result));

            test("doesn't re-compute the value", () => expect(calculation.callCount).toBe(1));
        });

        describe("when a source value changed", () => {
            beforeEach(() => {
                sourceB.setValue('B');
            });

            describe("when accessed again", () => {
                let result2: string;

                beforeEach(() => {
                    result2 = sut.value;
                });

                test("returns updated value", () => expect(result2).toBe('aB'));
            });
        });

        describe("when multiple source values changed", () => {
            beforeEach(() => {
                calculation.resetHistory();
                sourceA.setValue('A');
                sourceB.setValue('B');
            });

            describe("when accessed again", () => {
                let result2: string;

                beforeEach(() => {
                    result2 = sut.value;
                });

                test("returns updated value", () => expect(result2).toBe('AB'));

                test("re-computes only once", () => expect(calculation.callCount).toBe(1));
            });
        });

        describe("when subscribed to", () => {
            let observe: sinon.SinonStub;

            beforeEach(() => {
                observe = stub();
                sut.subscribe(observe);
            });

            test("doesn't notify immediately", () => expect(observe.called).toBe(false));

            describe("when a source value changed", () => {
                beforeEach(() => {
                    sourceA.setValue('A');
                });

                test("notifies observer", () => expect(observe.called).toBe(true));
            });
        });
    });

    describe("when derivation fires an event", () => {
        test("throws", () => {
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
    });

    describe("when derivation returns an event", () => {
        test("accessing value throws", () => {
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
    });

    describe("when derivation returns an events class", () => {
        test("accessing value throws", () => {
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
});

test("derivation that depends on other derivations only updates once", () => {
    let source = new ObservableValue(() => "source", "a");
    let inner1 = derive(() => source.value + "_inner1");
    let inner2 = derive(() => source.value + "_inner2");
    let outerCalc = spy(() => inner1.value + inner2.value);
    let outer = derive(outerCalc);
    outer.subscribe(() => { }); // Outer must be observed for sources to trigger an update

    // Initial access to set up dependencies
    outer.value;
    outerCalc.should.have.been.calledOnce;

    // This should trigger updates to inner1 and inner2, but outer should only re-calculate once
    source.setValue("b");
    outer.value;
    outerCalc.should.have.been.calledTwice;
});