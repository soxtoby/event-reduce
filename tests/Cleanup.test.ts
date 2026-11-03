import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, mock, spyOn, test, type Mock } from "bun:test"
import { createModel, derive, derived, disposeModel, event, ISignal, model, reduce, reduced, signal, state } from "event-reduce"
import { reactive } from "event-reduce-react"
import { getModelProperties } from "event-reduce/lib/models"
import { StoredAfterDisposalError, UnownedModelError } from "event-reduce/lib/ownership"
import { isModel } from "event-reduce/lib/symbols"
import { dispose } from "event-reduce/lib/utils"
import { createElement } from "react"
import { MockObserver } from "./MockObserver"

describe("subscription cleanup", () => {
    @model
    class Model {
        constructor(private _initial: number) { }

        @reduced
        get reducedProp() { return reduce(this._initial).value }
    }

    test("when reduction returns a new model, disposes old model", () => {
        let model = new Model(0)
        let unsubscribe = spyOnDispose(model, 'reducedProp')
        let createNewModel = event()
        using _ = createModel(() => ({
            reduction: reduce(model)
                .on(createNewModel, () => new Model(1))
        }))

        createNewModel()

        expect(unsubscribe).toHaveBeenCalled()
    })

    test("when reduction returns the same model, doesn't dispose model", () => {
        let modelInstance = new Model(0)
        let unsubscribe = spyOnDispose(modelInstance, 'reducedProp')
        let returnSameModel = event()
        using _ = createModel(() => ({
            reduction: reduce(modelInstance)
                .on(returnSameModel, () => modelInstance)
        }))

        returnSameModel()

        expect(unsubscribe).not.toHaveBeenCalled()
    })

    test("when derivation returns a new model, disposes old model", () => {
        let observable = signal(0, 'test Observable')
        let derivation = derive(() => new Model(observable.value))
        let modelInstance = derivation.value
        let unsubscribe = spyOnDispose(modelInstance, 'reducedProp')

        observable.setValue(1)
        derivation.value

        expect(unsubscribe).toHaveBeenCalled()
    })

    test("when derivation returns the same model, doesn't dispose model", () => {
        let observable = signal(0, 'test Observable')
        let modelInstance = new Model(0)
        let derivation = derive(() => {
            observable.value
            return modelInstance
        })
        derivation.value
        let unsubscribe = spyOnDispose(modelInstance, 'reducedProp')

        observable.setValue(1)
        derivation.value

        expect(unsubscribe).not.toHaveBeenCalled()
    })

    describe("when derivation returns a model from another observable value", () => {
        let model1: ISignal<Model>
        let model2: ISignal<Model>
        let useModel2: ISignal<boolean>
        let derivation: ReturnType<typeof derive<Model>>
        let modelInstance: Model
        let disposeModelSpy: Mock<() => void>

        beforeEach(() => {
            model1 = signal(new Model(1), 'model 1')
            model2 = signal(new Model(2), 'model 2')
            useModel2 = signal(false, 'switch')
            derivation = derive(() => useModel2.value ? model2.value : model1.value)
            modelInstance = derivation.value
            disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp')
        })

        test("when derived model changes to another model, doesn't dispose model", () => {
            useModel2.setValue(true)
            derivation.value

            expect(disposeModelSpy).not.toHaveBeenCalled()
        })

        test("when source observable value no longer holds onto model, doesn't dispose model", () => {
            model1.setValue(new Model(3))

            expect(disposeModelSpy).not.toHaveBeenCalled()
        })

        test("when both source observable value and derivation have switched to a different model, model is disposed", () => {
            model1.setValue(new Model(3))
            useModel2.setValue(true)
            derivation.value

            expect(disposeModelSpy).toHaveBeenCalled()
        })
    })

    test("when reduction adds a new model to an array, doesn't dispose model", () => {
        let addModel = event()
        let modelInstance = new Model(0)
        let disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp')
        using _ = createModel(() => ({
            reduction: reduce([modelInstance])
                .on(addModel, ms => ms.concat(new Model(1)))
        }))

        addModel()

        expect(disposeModelSpy).not.toHaveBeenCalled()
    })

    describe("when reduction removes a model from an array", () => {
        test("when model is only in the reduction, disposes removed model and doesn't dispose remaining model", () => {
            let removeModel = event()
            let model1 = new Model(1)
            let model2 = new Model(2)
            let dispose1 = spyOnDispose(model1, 'reducedProp')
            let dispose2 = spyOnDispose(model2, 'reducedProp')
            using _ = createModel(() => ({
                reduction: reduce([model1, model2])
                    .on(removeModel, ms => ms.slice(0, -1))
            }))

            removeModel()

            expect(dispose2).toHaveBeenCalled()
            expect(dispose1).not.toHaveBeenCalled()
        })

        test("when model is also in another observable value, doesn't dispose removed model", () => {
            let removeModel = event()
            let model1 = new Model(1)
            let model2 = new Model(2)
            let dispose1 = spyOnDispose(model1, 'reducedProp')
            let dispose2 = spyOnDispose(model2, 'reducedProp')
            using _ = createModel(() => ({
                reduction: reduce([model1, model2])
                    .on(removeModel, ms => ms.slice(0, -1))
            }))

            signal(model2, 'other value')

            removeModel()

            expect(dispose2).not.toHaveBeenCalled()
            expect(dispose1).not.toHaveBeenCalled()
        })
    })

    test("when reduction changes an array to a non-array, disposes items in array", () => {
        let replaceArray = event()
        let modelInstance = new Model(0)
        let disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp')
        using _ = createModel(() => ({
            reduction: reduce([modelInstance] as Model[] | null)
                .on(replaceArray, () => null)
        }))

        replaceArray()

        expect(disposeModelSpy).toHaveBeenCalled()
    })

    test("when reduction adds a model to an object, doesn't dispose model", () => {
        let addModel = event()
        let modelInstance = new Model(0)
        let disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp')
        using _ = createModel(() => ({
            reduction: reduce({ oldModel: modelInstance })
                .on(addModel, ms => ({ ...ms, newModel: new Model(1) }))
        }))

        addModel()

        expect(disposeModelSpy).not.toHaveBeenCalled()
    })

    describe("when reduction removes a model from an object", () => {
        test("when model is only in the reduction, disposes removed model and doesn't dispose remaining model", () => {
            let removeModel = event()
            let model1 = new Model(1)
            let model2 = new Model(2)
            let dispose1 = spyOnDispose(model1, 'reducedProp')
            let dispose2 = spyOnDispose(model2, 'reducedProp')
            using _ = createModel(() => ({
                reduction: reduce({ model1, model2 } as Record<string, Model | undefined>)
                    .on(removeModel, ms => {
                        let { model2, ...remaining } = ms
                        return remaining
                    })
            }))

            removeModel()

            expect(dispose2).toHaveBeenCalled()
            expect(dispose1).not.toHaveBeenCalled()
        })

        test("when model is also in another observable value, doesn't dispose models", () => {
            let removeModel = event()
            let model1 = new Model(1)
            let model2 = new Model(2)
            let dispose1 = spyOnDispose(model1, 'reducedProp')
            let dispose2 = spyOnDispose(model2, 'reducedProp')
            using _ = createModel(() => ({
                reduction: reduce({ model1, model2 } as Record<string, Model | undefined>)
                    .on(removeModel, ms => {
                        let { model2, ...remaining } = ms
                        return remaining
                    })
            }))

            signal(model2, 'other value')

            removeModel()

            expect(dispose2).not.toHaveBeenCalled()
            expect(dispose1).not.toHaveBeenCalled()
        })
    })

    test("when reduction replaces a model on an object, disposes removed model and doesn't dispose remaining model", () => {
        let removeModel = event()
        let model1 = new Model(1)
        let model2 = new Model(2)
        let dispose1 = spyOnDispose(model1, 'reducedProp')
        let dispose2 = spyOnDispose(model2, 'reducedProp')
        using _ = createModel(() => ({
            reduction: reduce({ model1, model2 } as Record<string, Model | undefined>)
                .on(removeModel, ms => ({ ...ms, model2: new Model(3) }))
        }))

        removeModel()

        expect(dispose2).toHaveBeenCalled()
        expect(dispose1).not.toHaveBeenCalled()
    })

    test("when reduction changes an object to a non-object, disposes values of object", () => {
        let replaceObject = event()
        let modelInstance = new Model(0)
        let disposeModelSpy = spyOnDispose(modelInstance, 'reducedProp')
        using _ = createModel(() => ({
            reduction: reduce({ model: modelInstance } as Record<string, Model> | null)
                .on(replaceObject, () => null)
        }))

        replaceObject()

        expect(disposeModelSpy).toHaveBeenCalled()
    })

    describe("when array items are also in another observable value", () => {
        test("when array value is disposed, doesn't dispose items", () => {
            let arrayValue = signal([new Model(0)], 'array value')
            signal(arrayValue.value[0], 'other value')
            let disposeModelSpy = spyOnDispose(arrayValue.value[0], 'reducedProp')

            arrayValue[dispose]()

            expect(disposeModelSpy).not.toHaveBeenCalled()
        })
    })

    describe("when object values are also in another observable value", () => {
        test("when object value is disposed, doesn't dispose values", () => {
            let objectValue = signal({ model: new Model(0) }, 'object value')
            signal(objectValue.value.model, 'other value')
            let disposeModelSpy = spyOnDispose(objectValue.value.model, 'reducedProp')

            objectValue[dispose]()

            expect(disposeModelSpy).not.toHaveBeenCalled()
        })
    })

    test("when model disposed, disposes all properties correctly", () => {
        @model
        class OuterModel {
            constructor(private _ownedModel: Model) { }

            @reduced
            get reducedProp() { return reduce(new Model(0)).value }

            @derived
            get derivedProp() { return new Model(1) }

            @state
            stateProp = new Model(2)

            @derived
            get externallyOwned() { return this._ownedModel }
        }
        let externalOwner = signal(new Model(3), 'external owner')
        let outerModel = new OuterModel(externalOwner.value) as OuterModel & Disposable
        let disposeReducedPropValue = spyOnDispose(outerModel.reducedProp, 'reducedProp')
        let disposeDerivedPropValue = spyOnDispose(outerModel.derivedProp, 'reducedProp')
        let disposeStatePropValue = spyOnDispose(outerModel.stateProp, 'reducedProp')
        let disposeExternallyOwnedPropValue = spyOnDispose(outerModel.externallyOwned, 'reducedProp')
        let disposeReducedProp = spyOnDispose(outerModel, 'reducedProp')
        let disposeDerivedProp = spyOnDispose(outerModel, 'derivedProp')
        let disposeExternallyOwnedProp = spyOnDispose(outerModel, 'externallyOwned')

        let outerOwner = signal(outerModel, 'outer owner')
        outerOwner.setValue(null!)

        expect(disposeReducedProp).toHaveBeenCalled()
        expect(disposeDerivedProp).toHaveBeenCalled()
        expect(disposeExternallyOwnedProp).toHaveBeenCalled()

        expect(disposeReducedPropValue).toHaveBeenCalled()
        expect(disposeDerivedPropValue).toHaveBeenCalled()
        expect(disposeStatePropValue).toHaveBeenCalled()

        expect(disposeExternallyOwnedPropValue).not.toHaveBeenCalled()
    })

    test("when many models are removed at once, disposes them all without overflowing the stack", () => {
        let clear = event('clear')
        let models = Array.from({ length: 20_000 }, (_, i) => new Model(i))
        let { list } = createModel(() => ({ list: reduce(models, 'list').on(clear, () => []) }))
        let disposeFirst = spyOnDispose(models[0], 'reducedProp')
        let disposeLast = spyOnDispose(models.at(-1)!, 'reducedProp')

        clear()

        expect(list.value).toEqual([])
        expect(disposeFirst).toHaveBeenCalled()
        expect(disposeLast).toHaveBeenCalled()
    })

    function spyOnDispose<T>(model: T, property: keyof T) {
        if (isModel(model)) {
            let observableValue = getModelProperties(model)[property]!
            if (dispose in observableValue)
                return spyOn(observableValue, dispose)
        }
        throw new Error(`Property ${String(property)} is not a disposable observable value on the provided model`)
    }
})

describe("reading after disposal", () => {
    test("reduction, when read after being disposed, returns its last value", () => {
        let increment = event('increment')
        let model = createModel(() => ({ reduction: reduce(1, 'reduction').on(increment, count => count + 1) }))
        let sut = model.reduction
        increment()

        model[dispose]()

        expect(sut.value).toBe(2)
    })

    test("derivation, when read after being disposed, returns its last value", () => {
        let source = signal(1, 'source')
        let model = createModel(() => ({ derivation: derive(() => source.value * 2, 'derivation') }))
        let sut = model.derivation
        sut.value

        model[dispose]()

        expect(sut.value).toBe(2)
    })

    test("derivation, when its source changed before it was disposed, returns its last value", () => {
        let source = signal(1, 'source')
        let model = createModel(() => ({ derivation: derive(() => source.value * 2, 'derivation') }))
        let sut = model.derivation
        sut.value
        source.setValue(2)

        model[dispose]()

        expect(sut.value).toBe(2)
    })

    test("signal, when read after being disposed, returns its last value", () => {
        let sut = signal(1, 'sut')

        sut[dispose]()

        expect(sut.value).toBe(1)
    })

    test("model property, when read after the model is replaced in its owner, returns its last value", () => {
        @model
        class Child {
            @reduced
            get value() { return reduce(1).value }
        }
        let replace = event('replace')
        let { owner } = createModel(() => ({ owner: reduce(new Child(), 'owner').on(replace, () => new Child()) }))
        let replaced = owner.value

        replace()

        expect(replaced.value).toBe(1)
    })

    test("observable, when read by a derivation after being disposed, isn't a source of the derivation", () => {
        let disposed = signal(1, 'disposed')
        disposed[dispose]()
        let sut = derive(() => disposed.value, 'sut')

        sut.value

        expect([...sut.getSources()]).not.toContain(disposed)
    })

    test("model in a component's previous props, when removed and the component re-renders, doesn't throw from React's props diff", () => {
        expect(console.timeStamp).toBeFunction() // React only diffs props when it can log them to the performance timeline

        @model
        class Item {
            @reduced
            get count() { return reduce(1).value }
        }
        let removeFirst = event('removeFirst')
        let { items } = createModel(() => ({ items: reduce([new Item(), new Item()], 'items').on(removeFirst, items => items.slice(1)) }))
        let ItemCount = ({ items }: { items: readonly Item[] }) => createElement('div', null, items.length)
        let List = reactive(function List() { return createElement(ItemCount, { items: items.value }) })
        let sut = render(createElement(List))

        act(() => removeFirst())

        expect(sut.container.textContent).toBe('1')
        sut.unmount()
    })
})

describe("disposeModel", () => {
    let increment = event('increment')

    @model
    class Child {
        @reduced
        get value() { return reduce(1).on(increment, count => count + 1).value }
    }

    test("outside a transition, stops the model updating straight away", () => {
        let sut = new Child()

        disposeModel(sut)
        increment()

        expect(sut.value).toBe(1)
    })

    test("during a transition, stops the model updating once the transition ends", () => {
        let sut = new Child()
        let disposeChild = event('disposeChild')
        using _ = createModel(() => ({
            disposer: reduce(0, 'disposer').on(disposeChild, count => {
                disposeModel(sut)
                return count + 1
            })
        }))

        disposeChild()
        increment()

        expect(sut.value).toBe(1)
    })
})

describe("mapped observable disposal", () => {
    let source: ISignal<number>
    let transform: Mock<(value: number) => number>

    beforeEach(() => {
        source = signal(1, 'source')
        transform = mock((value: number) => value)
    })

    test("mapped observable, when disposed while observed, stops observing its source", () => {
        let sut = source.map(transform, 'sut')
        sut.subscribe(new MockObserver())

        sut[dispose]()
        source.setValue(2)

        expect(transform).not.toHaveBeenCalled()
    })

    test("mapped observable, when subscribed to after being disposed, doesn't observe its source", () => {
        let sut = source.map(transform, 'sut')
        sut[dispose]()

        sut.subscribe(new MockObserver())
        source.setValue(2)

        expect(transform).not.toHaveBeenCalled()
    })
})

describe("disposed model reuse", () => {
    @model
    class Child {
        @reduced
        get value() { return reduce(1).value }
    }

    let disposed: Child

    beforeEach(() => {
        disposed = new Child()
        disposeModel(disposed)
    })

    test("reduction, when it stores a disposed model, throws", () => {
        let store = event('store')
        createModel(() => ({ sut: reduce(null as Child | null, 'sut').on(store, () => disposed) }))

        expect(() => store()).toThrow(StoredAfterDisposalError)
    })

    test("derivation, when it returns a disposed model, throws", () => {
        let sut = derive(() => disposed, 'sut')

        expect(() => sut.value).toThrow(StoredAfterDisposalError)
    })
})

describe("unowned model detection", () => {
    @model
    class Child {
        @reduced
        get value() { return reduce(1).value }
    }

    @model
    @state('child')
    class Parent {
        constructor(public child: Child) { }
    }

    test("derivation, when a model it creates is nested too deep to be owned, throws", () => {
        let sut = derive(() => ({ byKey: { a: [new Child()] } }), 'sut')

        expect(() => sut.value).toThrow(UnownedModelError)
    })

    test("derivation, when a loose model it creates is nested too deep to be owned, throws", () => {
        let sut = derive(() => ({ byKey: { a: [createModel(() => ({ value: reduce(1) }))] } }), 'sut')

        expect(() => sut.value).toThrow(UnownedModelError)
    })

    test("derivation, when a model it creates is owned by another model in its value, doesn't throw", () => {
        let sut = derive(() => new Parent(new Child()), 'sut')

        expect(sut.value.child.value).toBe(1)
    })

    test("reduction, when a model its reducer creates is nested too deep to be owned, throws", () => {
        let add = event('add')
        createModel(() => ({ sut: reduce({ byKey: {} as Record<string, Child[]> }, 'sut').on(add, () => ({ byKey: { a: [new Child()] } })) }))

        expect(() => add()).toThrow(UnownedModelError)
    })
})
