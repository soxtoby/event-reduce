import { beforeEach, describe, expect, test } from "bun:test";
import { derived, getState, model, reduce, reduced, state } from "event-reduce";

describe("legacy state", () => {
    @model
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

    @model
    class TestModel extends BaseModel {
        @state
        subClassProperty = 'subClass';
    }

    @model
    class ChildModel {
        constructor(private _initialValue: string) { }

        @reduced
        value = reduce(this._initialValue).value;
    }

    let sut: TestModel;

    beforeEach(() => {
        sut = new TestModel('ctor');
    });

    test("getState copies the correct properties", () => {
        let result = getState(sut);
        expect(JSON.stringify(result)).toBe(JSON.stringify({
            valueProperty: 1,
            reducedModel: { value: 'child' },
            modelArray: [
                { value: 'one' },
                { value: 'two' }
            ],
            subClassProperty: 'subClass',
            mergedModel: { value: 'merged' },
            constructorProperty: 'ctor'
        }));
    });
});
