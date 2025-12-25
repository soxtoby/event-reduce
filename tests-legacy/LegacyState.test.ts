import { describe, test, expect, beforeEach } from "bun:test";
import { derived, getState, reduce, reduced, setState, state, State } from "event-reduce";

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
        modelArray = reduce([new ChildModel('one'), new ChildModel('two')])
            .onRestore((_, arr) => arr.map(c => new ChildModel(c.value)))
            .value;

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

    describe(getState.name, () => {
        test("copies the correct properties", () => {
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

    describe(setState.name, () => {
        test("updates properties correctly", () => {
            let originalMergedModel = model.mergedModel;
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
            setState(model, stateValue);

            expect(model.valueProperty).toBe(2);
            expect(model.reducedModel).toBeInstanceOf(ChildModel);
            expect(model.reducedModel.value).toBe('child*');
            expect(model.modelArray[0]).toBeInstanceOf(ChildModel);
            expect(model.modelArray[1]).toBeInstanceOf(ChildModel);
            expect(model.modelArray[2]).toBeInstanceOf(ChildModel);
            expect(model.modelArray[0].value).toBe('one*');
            expect(model.modelArray[1].value).toBe('two*');
            expect(model.modelArray[2].value).toBe('three*');
            expect(model.mergedModel).toBe(originalMergedModel);
            expect(model.mergedModel.value).toBe('merged*');
            expect(model.subClassProperty).toBe('subClass*');
            expect(model.ignoredValue).toBe('ignored');
        });
    });
});