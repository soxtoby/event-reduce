import { beforeEach, describe, expect, spyOn, test, type Mock } from "bun:test";
import { derive, derived, event, reduce, reduced, state } from "event-reduce";
import { changeOwnedValue } from "event-reduce/lib/cleanup";
import { getObservableValue, model } from "event-reduce/lib/models";
import { ObservableValue } from "event-reduce/lib/observableValue";
import { StringKey } from "event-reduce/lib/types";
import { dispose } from "event-reduce/lib/utils";

describe("subscription cleanup", () => {
    @model
    class Model {
        constructor(private _initial: number) { }

        @reduced
        get reducedProp() { return reduce(this._initial).value };
    }

    describe("when reduction returns a new model", () => {
        test("disposes old model", () => {
            let model = new Model(0);
            let unsubscribe = spyOnDispose(model, 'reducedProp');
            let createNewModel = event();
            reduce(model)
                .on(createNewModel, () => new Model(1));

            createNewModel();

            expect(unsubscribe).toHaveBeenCalled();
        });
    });

    describe("when reduction returns the same model", () => {
        test("doesn't dispose model", () => {
            let modelInstance = new Model(0);
            let unsubscribe = spyOnDispose(modelInstance, 'reducedProp');
            let returnSameModel = event();
            reduce(modelInstance)
                .on(returnSameModel, () => modelInstance);

            returnSameModel();

            expect(unsubscribe).not.toHaveBeenCalled();
        });
    });

    describe("when derivation returns a new model", () => {
        test("disposes old model", () => {
            let source = new ObservableValue(() => 'test source', 0);
            let derivation = derive(() => new Model(source.value));
            let modelInstance = derivation.value;
            let unsubscribe = spyOnDispose(modelInstance, 'reducedProp');

            source.setValue(1);
            derivation.value;

            expect(unsubscribe).toHaveBeenCalled();
        });
    });

    describe("when derivation returns the same model", () => {
        test("doesn't dispose model", () => {
            let source = new ObservableValue(() => 'test source', 0);
            let modelInstance = new Model(0);
            let derivation = derive(() => {
                source.value;
                return modelInstance;
            });
            derivation.value;
            let unsubscribe = spyOnDispose(modelInstance, 'reducedProp');

            source.setValue(1);
            derivation.value;

            expect(unsubscribe).not.toHaveBeenCalled();
        });
    });

    describe("when derivation returns a model from another observable value", () => {
        let model1: ObservableValue<Model>;
        let model2: ObservableValue<Model>;
        let useModel2: ObservableValue<boolean>;
        let derivation: ReturnType<typeof derive<Model>>;
        let modelInstance: Model;
        let disposeModelSpy: Mock<() => void>;

        beforeEach(() => {
            model1 = new ObservableValue(() => 'model 1', new Model(1));
            model2 = new ObservableValue(() => 'model 2', new Model(2));
            useModel2 = new ObservableValue(() => 'switch', false);
            derivation = derive(() => useModel2.value ? model2.value : model1.value);
            modelInstance = derivation.value;
            disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp');
        });

        describe("when derived model changes to another model", () => {
            beforeEach(() => {
                useModel2.setValue(true);
                derivation.value;
            });

            test("doesn't dispose model", () => expect(disposeModelSpy).not.toHaveBeenCalled());
        });

        describe("when source observable value no longer holds onto model", () => {
            beforeEach(() => {
                model1.setValue(new Model(3));
            });

            test("doesn't dispose model", () => expect(disposeModelSpy).not.toHaveBeenCalled());
        });

        describe("when both source observable value and derivation have switched to a different model", () => {
            beforeEach(() => {
                model1.setValue(new Model(3));
                useModel2.setValue(true);
                derivation.value;
            });

            test("model is disposed", () => expect(disposeModelSpy).toHaveBeenCalled());
        });
    });

    describe("when reduction adds a new model to an array", () => {
        test("doesn't dispose model", () => {
            let addModel = event();
            let modelInstance = new Model(0);
            let disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp');
            reduce([modelInstance])
                .on(addModel, ms => ms.concat(new Model(1)));

            addModel();

            expect(disposeModelSpy).not.toHaveBeenCalled();
        });
    });

    describe("when reduction removes a model from an array", () => {
        describe("when model is only in the reduction", () => {
            test("disposes removed model and doesn't dispose remaining model", () => {
                let removeModel = event();
                let model1 = new Model(1);
                let model2 = new Model(2);
                let dispose1 = spyOnDispose(model1, 'reducedProp');
                let dispose2 = spyOnDispose(model2, 'reducedProp');
                reduce([model1, model2])
                    .on(removeModel, ms => ms.slice(0, -1));

                removeModel();

                expect(dispose2).toHaveBeenCalled();
                expect(dispose1).not.toHaveBeenCalled();
            });
        });

        describe("when model is also in another observable value", () => {
            test("doesn't dispose removed model", () => {
                let removeModel = event();
                let model1 = new Model(1);
                let model2 = new Model(2);
                let dispose1 = spyOnDispose(model1, 'reducedProp');
                let dispose2 = spyOnDispose(model2, 'reducedProp');
                reduce([model1, model2])
                    .on(removeModel, ms => ms.slice(0, -1));

                new ObservableValue(() => 'other value', model2);

                removeModel();

                expect(dispose2).not.toHaveBeenCalled();
                expect(dispose1).not.toHaveBeenCalled();
            });
        });
    });

    describe("when reduction changes an array to a non-array", () => {
        test("disposes items in array", () => {
            let replaceArray = event();
            let modelInstance = new Model(0);
            let disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp');
            reduce([modelInstance] as Model[] | null)
                .on(replaceArray, () => null);

            replaceArray();

            expect(disposeModelSpy).toHaveBeenCalled();
        });
    });

    describe("when reduction adds a model to an object", () => {
        test("doesn't dispose model", () => {
            let addModel = event();
            let modelInstance = new Model(0);
            let disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp');
            reduce({ oldModel: modelInstance })
                .on(addModel, ms => ({ ...ms, newModel: new Model(1) }));

            addModel();

            expect(disposeModelSpy).not.toHaveBeenCalled();
        });
    });

    describe("when reduction removes a model from an object", () => {
        describe("when model is only in the reduction", () => {
            test("disposes removed model and doesn't dispose remaining model", () => {
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

                removeModel();

                expect(dispose2).toHaveBeenCalled();
                expect(dispose1).not.toHaveBeenCalled();
            });
        });

        describe("when model is also in another observable value", () => {
            test("doesn't dispose models", () => {
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

                new ObservableValue(() => 'other value', model2);

                removeModel();

                expect(dispose2).not.toHaveBeenCalled();
                expect(dispose1).not.toHaveBeenCalled();
            });
        });
    });

    describe("when reduction replaces a model on an object", () => {
        test("disposes removed model and doesn't dispose remaining model", () => {
            let removeModel = event();
            let model1 = new Model(1);
            let model2 = new Model(2);
            let dispose1 = spyOnDispose(model1, 'reducedProp');
            let dispose2 = spyOnDispose(model2, 'reducedProp');
            reduce({ model1, model2 } as Record<string, Model | undefined>)
                .on(removeModel, ms => ({ ...ms, model2: new Model(3) }));

            removeModel();

            expect(dispose2).toHaveBeenCalled();
            expect(dispose1).not.toHaveBeenCalled();
        });
    });

    describe("when reduction changes an object to a non-object", () => {
        test("disposes values of object", () => {
            let replaceObject = event();
            let modelInstance = new Model(0);
            let disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp');
            reduce({ model: modelInstance } as Record<string, Model> | null)
                .on(replaceObject, () => null);

            replaceObject();

            expect(disposeModelSpy).toHaveBeenCalled();
        });
    });

    describe("when array items are also in another observable value", () => {
        describe("when array value is disposed", () => {
            test("doesn't dispose items", () => {
                let arrayValue = new ObservableValue(() => 'array value', [new Model(0)]);
                new ObservableValue(() => 'other value', arrayValue.value[0]);
                let disposeModelSpy = spyOnDispose(arrayValue.value[0], 'reducedProp');

                arrayValue[dispose]();

                expect(disposeModelSpy).not.toHaveBeenCalled();
            });
        });
    });

    describe("when object values are also in another observable value", () => {
        describe("when object value is disposed", () => {
            test("doesn't dispose values", () => {
                let objectValue = new ObservableValue(() => 'object value', { model: new Model(0) });
                new ObservableValue(() => 'other value', objectValue.value.model);
                let disposeModelSpy = spyOnDispose(objectValue.value.model, 'reducedProp');

                objectValue[dispose]();

                expect(disposeModelSpy).not.toHaveBeenCalled();
            });
        });
    });

    describe("when model disposed", () => {
        test("disposes all properties correctly", () => {
            @model
            class OuterModel {
                constructor(private _ownedModel: Model) { }

                @reduced
                accessor reducedProp = reduce(new Model(0)).value;

                @derived
                get derivedProp() { return new Model(1); }

                @state
                stateProp = new Model(2);

                @derived
                get externallyOwned() { return this._ownedModel; }
            }
            let externalOwner = new ObservableValue(() => 'external owner', new Model(3));
            let outerModel = new OuterModel(externalOwner.value);
            let disposeReducedPropValue = spyOnDispose(outerModel.reducedProp, 'reducedProp');
            let disposeDerivedPropValue = spyOnDispose(outerModel.derivedProp, 'reducedProp');
            let disposeStatePropValue = spyOnDispose(outerModel.stateProp, 'reducedProp');
            let disposeExternallyOwnedPropValue = spyOnDispose(outerModel.externallyOwned, 'reducedProp');
            let disposeReducedProp = spyOnDispose(outerModel, 'reducedProp');
            let disposeDerivedProp = spyOnDispose(outerModel, 'derivedProp');
            let disposeExternallyOwnedProp = spyOnDispose(outerModel, 'externallyOwned');

            changeOwnedValue(undefined!, outerModel, undefined);

            expect(disposeReducedProp).toHaveBeenCalled();
            expect(disposeDerivedProp).toHaveBeenCalled();
            expect(disposeExternallyOwnedProp).toHaveBeenCalled();

            expect(disposeReducedPropValue).toHaveBeenCalled();
            expect(disposeDerivedPropValue).toHaveBeenCalled();
            expect(disposeStatePropValue).toHaveBeenCalled();

            expect(disposeExternallyOwnedPropValue).not.toHaveBeenCalled();
        });
    });

    function spyOnDispose<T>(model: T, property: StringKey<T>) {
        let observableValue = getObservableValue(model, property)!;
        return spyOn(observableValue, dispose);
    }
});
