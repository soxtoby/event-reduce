import { renderHook } from "@testing-library/react-hooks";
import { useReactive } from "event-reduce-react";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { spy } from "sinon";
import { describe, it, test, then, when } from "wattle";

describe(useReactive.name, function () {
    let observableValue = new ObservableValue(() => 'test value', 'initial value');
    let innerBehaviour = () => { };
    let render = spy(() => {
        innerBehaviour();
        return observableValue.value;
    });

    let sut = renderHook(() => useReactive(render));

    test("render function called immediately", () => render.should.have.been.calledOnce);

    test("returns result of render function", () => sut.result.current.should.equal('initial value'));

    when("re-rendered", () => {
        sut.rerender();

        then("render function called again", () => render.should.have.been.calledTwice); // In case render function uses hooks
    });

    when("accessed observable value changed", () => {
        observableValue.setValue('new value');

        then("render function called again", () => render.should.have.been.calledTwice);

        it("returns updated result", () => sut.result.current.should.equal('new value'));
    });

    when("accessed observable value is changed during render", () => {
        innerBehaviour = () => observableValue.setValue('new value');
        render.resetHistory();
        sut.rerender();

        it("doesn't trigger an extra render", () => render.should.have.been.calledOnce);
    });

    sut.unmount();
});