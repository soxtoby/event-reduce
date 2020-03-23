import { derived, getState, reduce, reduced, setState, state, State } from "event-reduce";
import { describe, it } from "wattle";

describe("state", function () {
    class TestModel {
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

    class ChildModel {
        constructor(private _initialValue: string) { }

        @reduced
        value = reduce(this._initialValue).value;
    }

    let model = new TestModel('ctor');

    describe(getState.name, () => {
        let result = getState(model);

        it("copies the correct properties", () => JSON.stringify(result).should.equal(JSON.stringify({
            valueProperty: 1,
            reducedModel: { value: 'child' },
            modelArray: [
                { value: 'one' },
                { value: 'two' }
            ],
            mergedModel: { value: 'merged' },
            constructorProperty: 'ctor'
        })));
    });

    describe(setState.name, () => {
        let originalMergedModel = model.mergedModel;
        let state = {
            valueProperty: 2,
            reducedModel: { value: 'child*' },
            modelArray: [
                { value: 'one*' },
                { value: 'two*' },
                { value: 'three*' }
            ],
            mergedModel: { value: 'merged*' },
            ignoredValue: 'ignored*'
        } as State<TestModel>;
        setState(model, state);

        it("updates properties correctly", () => {
            model.valueProperty.should.equal(2);
            model.reducedModel.should.be.an.instanceOf(ChildModel);
            model.reducedModel.value.should.equal('child*');
            model.modelArray[0].should.be.an.instanceOf(ChildModel);
            model.modelArray[1].should.be.an.instanceOf(ChildModel);
            model.modelArray[2].should.be.an.instanceOf(ChildModel);
            model.modelArray[0].value.should.equal('one*');
            model.modelArray[1].value.should.equal('two*');
            model.modelArray[2].value.should.equal('three*');
            model.mergedModel.should.equal(originalMergedModel);
            model.mergedModel.value.should.equal('merged*');
            model.ignoredValue.should.equal('ignored');
        });
    });
});