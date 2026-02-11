import { derive, event, events } from "event-reduce";
import { DerivedEventsError, SideEffectInDerivationError } from "event-reduce/lib/derivation";
import { consumeLastAccessed, ObservableValue } from "event-reduce/lib/observableValue";
import { spy, stub } from "sinon";
import { describe, it, test, then, when } from "wattle";

describe(derive.name, () => {
    let sourceA = new ObservableValue(() => 'a', 'a');
    let sourceB = new ObservableValue(() => 'b', 'b');
    let calculation = spy(() => sourceA.value + sourceB.value);
    let sut = derive(calculation, 'sut');

    it("has provided name", () => sut.displayName.should.equal('sut'));

    when("value accessed", () => {
        let result = sut.value;

        it("returns result of calculation", () => result.should.equal('ab'));

        then("derivation is last accessed value", () => consumeLastAccessed()!.should.equal(sut));

        when("accessed again", () => {
            let result2 = sut.value;

            it("returns same value", () => result2.should.equal(result));

            it("doesn't re-compute the value", () => calculation.should.have.been.calledOnce);
        });

        when("a source value changed", () => {
            sourceB.setValue('B');

            when("accessed again", () => {
                let result2 = sut.value;

                it("returns updated value", () => result2.should.equal('aB'));
            });
        });

        when("multiple source values changed", () => {
            calculation.resetHistory();
            sourceA.setValue('A');
            sourceB.setValue('B');

            when("accessed again", () => {
                let result2 = sut.value;

                it("returns updated value", () => result2.should.equal('AB'));

                it("re-computes only once", () => calculation.should.have.been.calledOnce);
            });
        });

        when("subscribed to", () => {
            let observe = stub();
            sut.subscribe(observe);

            it("doesn't notify immediately", () => observe.should.not.have.been.called);

            when("a source value changed", () => {
                sourceA.setValue('A');

                it("notifies observer", () => observe.should.have.been.called);
            });
        });
    });

    when("derivation fires an event", () => {
        let sideEffect = event('some event');
        let sut = derive(() => sideEffect());

        it("throws", () => {
            let err = (() => sut.value).should.throw(SideEffectInDerivationError);
            err.has.property('derivation', sut);
            err.has.property('sideEffect', 'some event');
        });
    });

    when("derivation returns an event", () => {
        let eventValue = event('derived event');
        let sut = derive(() => sourceA.value && eventValue);

        then("accessing value throws", () => {
            let err = (() => sut.value).should.throw(DerivedEventsError);
            err.has.property('derivation', sut);
            err.has.property('value', eventValue);
        });
    });

    when("derivation returns an events class", () => {
        @events
        class Events { }
        let eventsValue = new Events();
        let sut = derive(() => sourceA.value && eventsValue);

        then("accesing value throws", () => {
            let err = (() => sut.value).should.throw(DerivedEventsError);
            err.has.property('derivation', sut);
            err.has.property('value', eventsValue);
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