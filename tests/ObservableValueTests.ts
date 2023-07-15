import { ObservableValue, collectAccessedValues, consumeLastAccessed } from "event-reduce/lib/observableValue";
import * as sinon from "sinon";
import { describe, it, then, when } from "wattle";

describe(ObservableValue.name, function () {
    let sut = new ObservableValue(() => 'sut', 'initial');
    let observer = sinon.stub();
    sut.subscribe(observer);

    when("value accessed", () => {
        let result = sut.value;

        it("returns provided value", () => result.should.equal('initial'));

        it("is last accessed value", () => consumeLastAccessed()!.should.equal(sut));
    });

    when("value changed", () => {
        sut.setValue('different');

        then("value updated", () => sut.value.should.equal('different'));

        then("observers notified", () => observer.should.have.been.called);
    });

    when("value set to same value", () => {
        sut.setValue('initial');

        then("observers not notified", () => observer.should.not.have.been.called);
    });
});

describe(collectAccessedValues.name, function () {
    let valueA = new ObservableValue(() => 'a', 'a');
    let valueB = new ObservableValue(() => 'b', 'b');

    when("multiple values accessed", () => {
        let result = collectAccessedValues(() => valueA.value + valueB.value);

        then("all accessed values returned", () => Array.from(result).should.have.members([valueA, valueB]));
    });
});