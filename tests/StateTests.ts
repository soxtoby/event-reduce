import { derived, getState, model, reduce, reduced, setState, state, State } from "event-reduce";
import { describe, it } from "wattle";

describe("state", function () {
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

    let testModel = new TestModel('ctor');

    describe(getState.name, () => {
        let result = getState(testModel);

        it("copies the correct properties", () => JSON.stringify(result).should.equal(JSON.stringify({
            valueProperty: 1,
            reducedModel: { value: 'child' },
            modelArray: [
                { value: 'one' },
                { value: 'two' }
            ],
            constructorProperty: 'ctor',
            mergedModel: { value: 'merged' },
            subClassProperty: 'subClass'
        })));
    });

    describe(setState.name, () => {
        let originalMergedModel = testModel.mergedModel;
        let state = {
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
        setState(testModel, state);

        it("updates properties correctly", () => {
            testModel.valueProperty.should.equal(2);
            testModel.reducedModel.should.be.an.instanceOf(ChildModel);
            testModel.reducedModel.value.should.equal('child*');
            testModel.modelArray[0].should.be.an.instanceOf(ChildModel);
            testModel.modelArray[1].should.be.an.instanceOf(ChildModel);
            testModel.modelArray[2].should.be.an.instanceOf(ChildModel);
            testModel.modelArray[0].value.should.equal('one*');
            testModel.modelArray[1].value.should.equal('two*');
            testModel.modelArray[2].value.should.equal('three*');
            testModel.mergedModel.should.equal(originalMergedModel);
            testModel.mergedModel.value.should.equal('merged*');
            testModel.subClassProperty.should.equal('subClass*');
            testModel.ignoredValue.should.equal('ignored');
        });
    });
});