import { derive, derived, event, reduce, reduced, state } from "event-reduce";
import { unsubscribeFromSources } from "event-reduce/lib/cleanup";
import { getObservableValues } from "event-reduce/lib/decorators";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { StringKey } from "event-reduce/lib/types";
import { spy } from "sinon";
import { describe, it, when } from "wattle";

describe("subscription cleanup", function () {
    class Model {
        constructor(private _initial: number) { }

        @reduced
        reducedProp = reduce(this._initial).value;
    }

    when("reduction returns a new model", () => {
        let model = new Model(0);
        let unsubscribe = spyOnUnsubscribe(model, 'reducedProp');
        let createNewModel = event();
        reduce(model)
            .on(createNewModel, () => new Model(1));

        createNewModel();

        it("unsubscribes old model from events", () => unsubscribe.should.have.been.called);
    });

    when("reduction returns the same model", () => {
        let model = new Model(0);
        let unsubscribe = spyOnUnsubscribe(model, 'reducedProp');
        let returnSameModel = event();
        reduce(model)
            .on(returnSameModel, () => model);

        returnSameModel();

        it("doesn't unsubscribe model from events", () => unsubscribe.should.not.have.been.called);
    });

    when("derivation returns a new model", () => {
        let source = new ObservableValue(() => 'test source', 0);
        let derivation = derive(() => new Model(source.value));
        let model = derivation.value;
        let unsubscribe = spyOnUnsubscribe(model, 'reducedProp');

        source.setValue(1);
        derivation.value;

        it("unsubscribes old model from events", () => unsubscribe.should.have.been.called);
    });

    when("derivation returns the same model", () => {
        let source = new ObservableValue(() => 'test source', 0);
        let model = new Model(0);
        let derivation = derive(() => {
            source.value;
            return model;
        });
        derivation.value;
        let unsubscribe = spyOnUnsubscribe(model, 'reducedProp');

        source.setValue(1);
        derivation.value;

        it("doesn't unsubscribe model from events", () => unsubscribe.should.not.have.been.called);
    });

    when("derivation returns a model from another observable value", () => {
        let model1 = new ObservableValue(() => 'model 1', new Model(1));
        let model2 = new ObservableValue(() => 'model 2', new Model(2));
        let useModel2 = new ObservableValue(() => 'switch', false);
        let derivation = derive(() => useModel2.value ? model2.value : model1.value);
        let model = derivation.value;
        let unsubscribe = spyOnUnsubscribe(model, 'reducedProp');

        useModel2.setValue(true);
        derivation.value;

        it("doesn't unsubscribe model from events", () => unsubscribe.should.not.have.been.called);
    });

    when("reduction adds a new model to an array", () => {
        let addModel = event();
        let model = new Model(0);
        let unsubscribe = spyOnUnsubscribe(model, 'reducedProp');
        reduce([model])
            .on(addModel, ms => ms.concat(new Model(1)));

        addModel();

        it("doesn't unsubscribe model from events", () => unsubscribe.should.not.have.been.called);
    });

    when("reduction removes a model from an array", () => {
        let removeModel = event();
        let model1 = new Model(1);
        let model2 = new Model(2);
        let unsubscribe1 = spyOnUnsubscribe(model1, 'reducedProp');
        let unsubscribe2 = spyOnUnsubscribe(model2, 'reducedProp');

        when("model is owned by reduction", () => {
            reduce([model1, model2])
                .on(removeModel, ms => ms.slice(0, -1));

            removeModel();

            it("unsubscribes removed model from events", () => unsubscribe2.should.have.been.called);

            it("doesn't unsubscribe remaining model from events", () => unsubscribe1.should.not.have.been.called);
        });

        when("model is owned by a different observable value", () => {
            let model2Owner = new ObservableValue(() => 'model owner', model2);

            reduce([model1, model2Owner.value])
                .on(removeModel, ms => ms.slice(0, -1));

            removeModel();

            it("doesn't unsubscribe removed model from events", () => unsubscribe2.should.not.have.been.called);

            it("doesn't unsubscribe remaining model from events", () => unsubscribe1.should.not.have.been.called);
        });
    });

    when("reduction changes an array to a non-array", () => {
        let replaceArray = event();
        let model = new Model(0);
        let unsubscribe = spyOnUnsubscribe(model, 'reducedProp');
        reduce([model] as Model[] | null)
            .on(replaceArray, () => null);

        replaceArray();

        it("unsubscribes items in array from events", () => unsubscribe.should.have.been.called);
    });

    when("reduction adds a model to an object", () => {
        let addModel = event();
        let model = new Model(0);
        let unsubscribe = spyOnUnsubscribe(model, 'reducedProp');
        reduce({ oldModel: model })
            .on(addModel, ms => ({ ...ms, newModel: new Model(1) }));

        addModel();

        it("doesn't unsubscribe model from events", () => unsubscribe.should.not.have.been.called);
    });

    when("reduction removes a model from an object", () => {
        let removeModel = event();
        let model1 = new Model(1);
        let model2 = new Model(2);
        let unsubscribe1 = spyOnUnsubscribe(model1, 'reducedProp');
        let unsubscribe2 = spyOnUnsubscribe(model2, 'reducedProp');

        when("model is owned by reduction", () => {
            reduce({ model1, model2 } as Record<string, Model | undefined>)
                .on(removeModel, ms => {
                    let { model2, ...remaining } = ms;
                    return remaining;
                });

            removeModel();

            it("unsubscribes removed model from events", () => unsubscribe2.should.have.been.called);

            it("doesn't unsubscribe remaining model from events", () => unsubscribe1.should.not.have.been.called);
        });

        when("model is owned by a different observable value", () => {
            let model2Owner = new ObservableValue(() => 'model owner', model2);

            reduce({ model1, model2: model2Owner.value } as Record<string, Model | undefined>)
                .on(removeModel, ms => {
                    let { model2, ...remaining } = ms;
                    return remaining;
                });

            removeModel();

            it("doesn't unsubscribe removed model from events", () => unsubscribe2.should.not.have.been.called);

            it("doesn't unsubscribe remaining model from events", () => unsubscribe1.should.not.have.been.called);
        });
    });

    when("reduction replaces a model on an object", () => {
        let removeModel = event();
        let model1 = new Model(1);
        let model2 = new Model(2);
        let unsubscribe1 = spyOnUnsubscribe(model1, 'reducedProp');
        let unsubscribe2 = spyOnUnsubscribe(model2, 'reducedProp');
        reduce({ model1, model2 } as Record<string, Model | undefined>)
            .on(removeModel, ms => ({ ...ms, model2: new Model(3) }));

        removeModel();

        it("unsubscribes removed model from events", () => unsubscribe2.should.have.been.called);

        it("doesn't unsubscribe remaining model from events", () => unsubscribe1.should.not.have.been.called);
    });

    when("reduction changes an object to a non-object", () => {
        let replaceObject = event();
        let model = new Model(0);
        let unsubscribe = spyOnUnsubscribe(model, 'reducedProp');
        reduce({ model } as Record<string, Model> | null)
            .on(replaceObject, () => null);

        replaceObject();

        it("unsubscribes values of object from events", () => unsubscribe.should.have.been.called);
    });

    when("array items are owned by a different observable value", () => {
        let modelOwner = new ObservableValue(() => 'model owner', new Model(0));
        let arrayOwner = new ObservableValue(() => 'array owner', [modelOwner.value]);
        let unsubscribe = spyOnUnsubscribe(modelOwner.value, 'reducedProp');

        when("array is unsubscribed from events", () => {
            unsubscribeFromSources(arrayOwner.value);

            it("doesn't unsubscribe items from events", () => unsubscribe.should.not.have.been.called);
        });
    });

    when("object values are owned by a different observable value", () => {
        let modelOwner = new ObservableValue(() => 'model owner', new Model(0));
        let objectOwner = new ObservableValue(() => 'object owner', { model: modelOwner.value });
        let unsubscribe = spyOnUnsubscribe(modelOwner.value, 'reducedProp');

        when("object is unsubscribed from events", () => {
            unsubscribeFromSources(objectOwner.value);

            it("doesn't unsubscribe values from events", () => unsubscribe.should.not.have.been.called);
        });
    });

    when("model unsubscribed from events", () => {
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
        let unsubscribeReducedPropValue = spyOnUnsubscribe(model.reducedProp, 'reducedProp');
        let unsubscribeDerivedPropValue = spyOnUnsubscribe(model.derivedProp, 'reducedProp');
        let unsubscribeStatePropValue = spyOnUnsubscribe(model.stateProp, 'reducedProp');
        let unsubscribeExternallyOwnedPropValue = spyOnUnsubscribe(model.externallyOwned, 'reducedProp');
        let unsubscribeReducedProp = spyOnUnsubscribe(model, 'reducedProp');
        let unsubscribeDerivedProp = spyOnUnsubscribe(model, 'derivedProp');
        let unsubscribeExternallyOwnedProp = spyOnUnsubscribe(model, 'externallyOwned');

        unsubscribeFromSources(model);

        it("unsubscribes reduced property from events", () => unsubscribeReducedProp.should.have.been.called);
        it("unsubscribes derived property from events", () => unsubscribeDerivedProp.should.have.been.called);
        it("unsubscribes externally owned model property from events", () => unsubscribeExternallyOwnedProp.should.have.been.called);

        it("unsubscribes reduced property value from events", () => unsubscribeReducedPropValue.should.have.been.called);
        it("unsubscribes derived property value from events", () => unsubscribeDerivedPropValue.should.have.been.called);
        it("unsubscribes state property value from events", () => unsubscribeStatePropValue.should.have.been.called);

        it("doesn't unsubscribe externally owned model from events", () => unsubscribeExternallyOwnedPropValue.should.not.have.been.called);
    });

    function spyOnUnsubscribe<T>(model: T, property: StringKey<T>) {
        let observableValue = getObservableValues(model)![property];
        return spy(observableValue, 'unsubscribeFromSources');
    }
});