import { watch } from "event-reduce";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { spy } from "sinon";
import { describe, it, when } from "wattle";

describe(watch.name, function () {
    let sourceA = new ObservableValue(() => 'a', 'a');
    let sourceB = new ObservableValue(() => 'b', 'b');
    let accessValues = () => sourceA.value;
    let action = spy(() => accessValues());
    let result = watch(action, 'sut');

    let observer = spy();
    result.subscribe(observer);

    it("runs action straight away", () => action.should.have.been.calledOnce);

    when("source value changed", () => {
        sourceA.setValue('A');

        it("notifies observers", () => observer.should.have.been.called);

        it("doesn't run action again", () => action.should.have.been.calledOnce);
    });

    when("run again", () => {
        result.run();

        it("runs action again", () => action.should.have.been.calledTwice);
    });

    when("action's sources change between runs", () => {
        accessValues = () => sourceB.value;
        result.run();

        when("old source value changed", () => {
            sourceA.setValue('AA');

            it("doesn't notify observers", () => observer.should.not.have.been.called);
        });

        when("new source value changed", () => {
            sourceB.setValue('B');

            it("notifies observers", () => observer.should.have.been.called);
        });
    });

    when("unsubscribed from sources", () => {
        result.unsubscribeFromSources();

        when("source value changed", () => {
            sourceA.setValue('A');

            it("doesn't notify observers", () => observer.should.not.have.been.called);
        });
    });
});