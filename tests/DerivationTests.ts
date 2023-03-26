import { derive } from "event-reduce";
import { consumeLastAccessed, ObservableValue } from "event-reduce/lib/observableValue";
import { spy, stub } from "sinon";
import { describe, it, then, when } from "wattle";

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

                it("notifies observer of new value", () => observe.should.have.been.calledWith('Ab'));
            });
        });
    });
});