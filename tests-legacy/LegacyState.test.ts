import { beforeEach, describe, expect, test } from "bun:test";
import { derived, getState, reduce, reduced, state } from "event-reduce";

describe("legacy state", () => {
    class BaseModel {
        constructor(@state('constructorProperty') public constructorProperty: string) { }

        @reduced
        valueProperty = reduce(1).value;

        @derived
        get valuePlusOne() {
            return this.valueProperty + 1;
        }

        func() { }

        @reduced
        reducedModel = reduce(new ChildModel('child')).value;

        @reduced
        modelArray = reduce([new ChildModel('one'), new ChildModel('two')]).value;

        @state
        mergedModel = new ChildModel('merged');

        ignoredValue = 'ignored';
    }

    class TestModel extends BaseModel {
        @state
        subClassProperty = 'subClass';
    }

    class ChildModel {
        constructor(private _initialValue: string) { }

        @reduced
        value = reduce(this._initialValue).value;
    }

    let model: TestModel;

    beforeEach(() => {
        model = new TestModel('ctor');
    });

    test("getState copies the correct properties", () => {
        let result = getState(model);
        expect(JSON.stringify(result)).toBe(JSON.stringify({
            valueProperty: 1,
            reducedModel: { value: 'child' },
            modelArray: [
                { value: 'one' },
                { value: 'two' }
            ],
            mergedModel: { value: 'merged' },
            constructorProperty: 'ctor',
            subClassProperty: 'subClass'
        }));
    });
});
