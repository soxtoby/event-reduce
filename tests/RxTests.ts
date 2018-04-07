import { describe, it, when } from "wattle";
import { useObservableType, Observable, resetObservableType } from "../src/observable";
import { Observable as rxObservable } from 'rxjs';
import { testObservableOperators } from "./ObservableOperatorTests";

describe("rx integration", function () {
    when("using rx Observable", () => {
        useObservableType(rxObservable as any);
    
        it("replaces default Observable", () => Observable.should.equal(rxObservable));
    
        testObservableOperators();

        when("Observable type reset", () => {
            resetObservableType();

            it("replaces Observable with SimpleObservable", () => Observable.name.should.equal('SimpleObservable'));
        });
    });

    resetObservableType();
});