import { describe, test, expect, beforeEach } from "bun:test";
import { derived, getState, model, reduce, reduced, setState, state, State } from "event-reduce";

describe("state", () => {
    @model
    @state('constructorProperty')
    class BaseModel {
        constructor(public constructorProperty: string) { }

        @reduced
        accessor valueProperty = reduce(1).value;

        @derived
        get valuePlusOne() {
            return this.valueProperty + 1;
        }

        func() { }

        @reduced
        accessor reducedModel = reduce(new ChildModel('child')).value;

        @reduced
        accessor modelArray = reduce([new ChildModel('one'), new ChildModel('two')])
            .onRestore((_, arr) => arr.map(c => new ChildModel(c.value)))
            .value;

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
        get value() { return reduce(this._initialValue).value; }
    }

    let testModel: TestModel;

    beforeEach(() => {
        testModel = new TestModel('ctor');
    });

    describe("getState", () => {
        test("copies the correct properties", () => {
            let result = getState(testModel);
            expect(JSON.stringify(result)).toBe(JSON.stringify({
                valueProperty: 1,
                reducedModel: { value: 'child' },
                modelArray: [
                    { value: 'one' },
                    { value: 'two' }
                ],
                constructorProperty: 'ctor',
                mergedModel: { value: 'merged' },
                subClassProperty: 'subClass'
            }));
        });
    });

    describe("setState", () => {
        test("updates properties correctly", () => {
            let originalMergedModel = testModel.mergedModel;
            let stateValue = {
                valueProperty: 2,
                reducedModel: { value: 'child*' },
                modelArray: [
                    { value: 'one*' },
                    { value: 'two*' },
                    { value: 'three*' }
                ],
                mergedModel: { value: 'merged*' },
                subClassProperty: 'subClass*',
                ignoredValue: 'ignored*'
            } as State<TestModel>;
            setState(testModel, stateValue);

            expect(testModel.valueProperty).toBe(2);
            expect(testModel.reducedModel).toBeInstanceOf(ChildModel);
            expect(testModel.reducedModel.value).toBe('child*');
            expect(testModel.modelArray[0]).toBeInstanceOf(ChildModel);
            expect(testModel.modelArray[1]).toBeInstanceOf(ChildModel);
            expect(testModel.modelArray[2]).toBeInstanceOf(ChildModel);
            expect(testModel.modelArray[0].value).toBe('one*');
            expect(testModel.modelArray[1].value).toBe('two*');
            expect(testModel.modelArray[2].value).toBe('three*');
            expect(testModel.mergedModel).toBe(originalMergedModel);
            expect(testModel.mergedModel.value).toBe('merged*');
            expect(testModel.subClassProperty).toBe('subClass*');
            expect(testModel.ignoredValue).toBe('ignored');
        });
    });
});