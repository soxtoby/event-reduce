import { watch } from "event-reduce";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { describe, it, when } from "wattle";
import './setup';
import sinon = require("sinon");

describe(watch.name, function () {
    let sourceA = new ObservableValue(() => 'a', 'a');
    let sourceB = new ObservableValue(() => 'b', 'b');
    let accessValues = () => sourceA.value;
    let action = sinon.spy(() => accessValues());
    let result = watch(action, 'sut');

    it("runs action straight away", () => action.should.have.been.calledOnce);

    when("source value changed", () => {
        sourceA.setValue('A');

        it("runs action again", () => action.should.have.been.calledTwice);
    });

    when("action's sources change", () => {
        accessValues = () => sourceB.value;
        sourceA.setValue('A');

        when("old source value changed", () => {
            sourceA.setValue('AA');

            it("doesn't run action again", () => action.should.have.been.calledTwice);
        });

        when("new source value changed", () => {
            sourceB.setValue('B');

            it("runs action again", () => action.should.have.been.calledThrice);
        });
    });

    when("unsubscribe function called", () => {
        result();

        when("source value changed", () => {
            sourceA.setValue('A');

            it("doesn't run action again", () => action.should.have.been.calledOnce);
        });
    });
});