import { derive, derived, event, reduce, reduced, state } from "event-reduce";
import { changeOwnedValue } from "event-reduce/lib/cleanup";
import { getObservableValues } from "event-reduce/lib/decorators";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { StringKey } from "event-reduce/lib/types";
import { spy } from "sinon";
import { describe, it, then, when } from "wattle";

describe("subscription cleanup", function () {
    class Model {
        constructor(private _initial: number) { }

        @reduced
        reducedProp = reduce(this._initial).value;
    }

    when("reduction returns a new model", () => {
        let model = new Model(0);
        let unsubscribe = spyOnDispose(model, 'reducedProp');
        let createNewModel = event();
        reduce(model)
            .on(createNewModel, () => new Model(1));

        createNewModel();

        it("disposes old model", () => unsubscribe.should.have.been.called);
    });

    when("reduction returns the same model", () => {
        let model = new Model(0);
        let unsubscribe = spyOnDispose(model, 'reducedProp');
        let returnSameModel = event();
        reduce(model)
            .on(returnSameModel, () => model);

        returnSameModel();

        it("doesn't dispose model", () => unsubscribe.should.not.have.been.called);
    });

    when("derivation returns a new model", () => {
        let source = new ObservableValue(() => 'test source', 0);
        let derivation = derive(() => new Model(source.value));
        let model = derivation.value;
        let unsubscribe = spyOnDispose(model, 'reducedProp');

        source.setValue(1);
        derivation.value;

        it("disposes old model", () => unsubscribe.should.have.been.called);
    });

    when("derivation returns the same model", () => {
        let source = new ObservableValue(() => 'test source', 0);
        let model = new Model(0);
        let derivation = derive(() => {
            source.value;
            return model;
        });
        derivation.value;
        let unsubscribe = spyOnDispose(model, 'reducedProp');

        source.setValue(1);
        derivation.value;

        it("doesn't dispose model", () => unsubscribe.should.not.have.been.called);
    });

    when("derivation returns a model from another observable value", () => {
        let model1 = new ObservableValue(() => 'model 1', new Model(1));
        let model2 = new ObservableValue(() => 'model 2', new Model(2));
        let useModel2 = new ObservableValue(() => 'switch', false);
        let derivation = derive(() => useModel2.value ? model2.value : model1.value);
        let model = derivation.value;
        let disposeModel = spyOnDispose(model, 'reducedProp');

        when("derived model changes to another model", () => {
            useModel2.setValue(true);
            derivation.value;

            it("doesn't dispose model", () => disposeModel.should.not.have.been.called);
        });

        when("source observable value no longer holds onto model", () => {
            model1.setValue(new Model(3));

            it("doesn't dispose model", () => disposeModel.should.not.have.been.called);
        });

        when("both source observable value and derivation have switched to a different model", () => {
            model1.setValue(new Model(3));
            useModel2.setValue(true);
            derivation.value;

            then("model is disposed", () => disposeModel.should.have.been.called);
        });
    });

    when("reduction adds a new model to an array", () => {
        let addModel = event();
        let model = new Model(0);
        let disposeModel = spyOnDispose(model, 'reducedProp');
        reduce([model])
            .on(addModel, ms => ms.concat(new Model(1)));

        addModel();

        it("doesn't dispose model", () => disposeModel.should.not.have.been.called);
    });

    when("reduction removes a model from an array", () => {
        let removeModel = event();
        let model1 = new Model(1);
        let model2 = new Model(2);
        let dispose1 = spyOnDispose(model1, 'reducedProp');
        let dispose2 = spyOnDispose(model2, 'reducedProp');
        reduce([model1, model2])
            .on(removeModel, ms => ms.slice(0, -1));

        when("model is only in the reduction", () => {
            removeModel();

            it("disposes removed model", () => dispose2.should.have.been.called);

            it("doesn't dispose remaining model", () => dispose1.should.not.have.been.called);
        });

        when("model is also in another observable value", () => {
            new ObservableValue(() => 'other value', model2);

            removeModel();

            it("doesn't dispose removed model", () => dispose2.should.not.have.been.called);

            it("doesn't dispose remaining model", () => dispose1.should.not.have.been.called);
        });
    });

    when("reduction changes an array to a non-array", () => {
        let replaceArray = event();
        let model = new Model(0);
        let disposeModel = spyOnDispose(model, 'reducedProp');
        reduce([model] as Model[] | null)
            .on(replaceArray, () => null);

        replaceArray();

        it("dispes items in array", () => disposeModel.should.have.been.called);
    });

    when("reduction adds a model to an object", () => {
        let addModel = event();
        let model = new Model(0);
        let disposModel = spyOnDispose(model, 'reducedProp');
        reduce({ oldModel: model })
            .on(addModel, ms => ({ ...ms, newModel: new Model(1) }));

        addModel();

        it("doesn't dispose model", () => disposModel.should.not.have.been.called);
    });

    when("reduction removes a model from an object", () => {
        let removeModel = event();
        let model1 = new Model(1);
        let model2 = new Model(2);
        let dispose1 = spyOnDispose(model1, 'reducedProp');
        let dispose2 = spyOnDispose(model2, 'reducedProp');
        reduce({ model1, model2 } as Record<string, Model | undefined>)
            .on(removeModel, ms => {
                let { model2, ...remaining } = ms;
                return remaining;
            });

        when("model is only in the reduction", () => {
            removeModel();

            it("disposes removed model", () => dispose2.should.have.been.called);

            it("doesn't dispose remaining model", () => dispose1.should.not.have.been.called);
        });

        when("model is also in another observable value", () => {
            new ObservableValue(() => 'other value', model2);

            removeModel();

            it("doesn't dispose removed model", () => dispose2.should.not.have.been.called);

            it("doesn't dispose remaining model", () => dispose1.should.not.have.been.called);
        });
    });

    when("reduction replaces a model on an object", () => {
        let removeModel = event();
        let model1 = new Model(1);
        let model2 = new Model(2);
        let dispose1 = spyOnDispose(model1, 'reducedProp');
        let dispose2 = spyOnDispose(model2, 'reducedProp');
        reduce({ model1, model2 } as Record<string, Model | undefined>)
            .on(removeModel, ms => ({ ...ms, model2: new Model(3) }));

        removeModel();

        it("disposes removed model", () => dispose2.should.have.been.called);

        it("doesn't dispose remaining model", () => dispose1.should.not.have.been.called);
    });

    when("reduction changes an object to a non-object", () => {
        let replaceObject = event();
        let model = new Model(0);
        let disposeModel = spyOnDispose(model, 'reducedProp');
        reduce({ model } as Record<string, Model> | null)
            .on(replaceObject, () => null);

        replaceObject();

        it("disposes values of object", () => disposeModel.should.have.been.called);
    });

    when("array items are also in another observable value", () => {
        let arrayValue = new ObservableValue(() => 'array value', [new Model(0)]);
        new ObservableValue(() => 'other value', arrayValue.value[0]);
        let disposeModel = spyOnDispose(arrayValue.value[0], 'reducedProp');

        when("array value is disposed", () => {
            arrayValue.dispose();

            it("doesn't dispose items", () => disposeModel.should.not.have.been.called);
        });
    });

    when("object values are also in another observable value", () => {
        let objectValue = new ObservableValue(() => 'object value', { model: new Model(0) });
        new ObservableValue(() => 'other value', objectValue.value.model);
        let disposeModel = spyOnDispose(objectValue.value.model, 'reducedProp');

        when("object value is disposed", () => {
            objectValue.dispose();

            it("doesn't dispose values", () => disposeModel.should.not.have.been.called);
        });
    });

    when("model disposed", () => {
        class OuterModel {
            constructor(private _ownedModel: Model) { }

            @reduced
            reducedProp = reduce(new Model(0)).value;

            @derived
            get derivedProp() { return new Model(1); }

            @state
            stateProp = new Model(2);

            @derived
            get externallyOwned() { return this._ownedModel; }
        }
        let externalOwner = new ObservableValue(() => 'external owner', new Model(3));
        let model = new OuterModel(externalOwner.value);
        let disposeReducedPropValue = spyOnDispose(model.reducedProp, 'reducedProp');
        let disposeDerivedPropValue = spyOnDispose(model.derivedProp, 'reducedProp');
        let disposeStatePropValue = spyOnDispose(model.stateProp, 'reducedProp');
        let disposeExternallyOwnedPropValue = spyOnDispose(model.externallyOwned, 'reducedProp');
        let disposeReducedProp = spyOnDispose(model, 'reducedProp');
        let disposeDerivedProp = spyOnDispose(model, 'derivedProp');
        let disposeExternallyOwnedProp = spyOnDispose(model, 'externallyOwned');

        changeOwnedValue(undefined!, model, undefined);

        it("disposes reduced property", () => disposeReducedProp.should.have.been.called);
        it("disposes derived property", () => disposeDerivedProp.should.have.been.called);
        it("disposes externally owned model property", () => disposeExternallyOwnedProp.should.have.been.called);

        it("disposes reduced property value", () => disposeReducedPropValue.should.have.been.called);
        it("disposes derived property value", () => disposeDerivedPropValue.should.have.been.called);
        it("disposes state property value", () => disposeStatePropValue.should.have.been.called);

        it("doesn't dispose externally owned model", () => disposeExternallyOwnedPropValue.should.not.have.been.called);
    });

    function spyOnDispose<T>(model: T, property: StringKey<T>) {
        let observableValue = getObservableValues(model)[property];
        return spy(observableValue, 'dispose');
    }
});