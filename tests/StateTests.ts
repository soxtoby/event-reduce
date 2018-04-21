import { computed } from "mobx";
import { describe, it } from "wattle";
import { reduced } from "../src/mobx";
import { reduce } from "../src/reduction";
import { plainState, state } from "./../src/experimental/state";
import './setup';

describe("serialize", function () {
    class TestModel {
        @reduced
        valueProperty = reduce(1).value;

        @computed
        get valuePlusOne() {
            return this.valueProperty + 1;
        }

        func() { }

        @reduced
        modelProperty = reduce(new ChildModel('child')).value;

        @reduced
        modelArray = reduce([
            new ChildModel('one'),
            new ChildModel('two')
        ]).value;

        plainValue = 'plain';

        @state
        stateValue = 'state'
    }

    class ChildModel {
        constructor(private _initialValue: string) { }

        @reduced
        value = reduce(this._initialValue).value;
    }

    let model = new TestModel();

    let result = plainState(model);

    it("copies the correct properties", () => JSON.stringify(result).should.equal(JSON.stringify({
        valueProperty: 1,
        modelProperty: { value: 'child' },
        modelArray: [
            { value: 'one' },
            { value: 'two' }
        ],
        stateValue: 'state'
    })));
});