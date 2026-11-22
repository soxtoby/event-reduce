import { describe, expect, test } from "bun:test"
import { getState, model, state, stringifyState } from "event-reduce"
import { mutable } from "event-reduce/lib/testing"
import { TestModel } from "./State.test/TestModel"

describe("state", () => {
    test("state fields and constructor properties reject reassignment after construction", () => {
        let sut = new TestModel('ctor')

        expect(() => { sut.mergedModel = sut.modelArray[0] }).toThrow(TypeError)
        expect(() => { sut.constructorProperty = 'changed' }).toThrow(TypeError)
        expect(getState(sut).mergedModel).toEqual({ value: 'merged' })
    })

    test("state accessors keep the value assigned during construction", () => {
        @model
        class AccessorModel {
            @state accessor value = 'initial'

            constructor() { this.value = 'final' }
        }

        let sut = new AccessorModel()

        expect(() => { sut.value = 'changed' }).toThrow(TypeError)
        expect(sut.value).toBe('final')
    })

    test("mutable allows overriding a state property", () => {
        let sut = new TestModel('ctor')
        mutable(sut).constructorProperty = 'changed'
        expect(getState(sut).constructorProperty).toBe('changed')
    })

    test("getState copies the correct properties", () => {
        let testModel = new TestModel('ctor')
        let result = getState(testModel)
        expect(JSON.stringify(result)).toBe(JSON.stringify({
            valueProperty: 1,
            reducedModel: { value: 'child' },
            modelArray: [
                { value: 'one' },
                { value: 'two' }
            ],
            mergedModel: { value: 'merged' },
            subClassProperty: 'subClass',
            constructorProperty: 'ctor',
        }))
    })

    test("getState can include derived properties", () => {
        let testModel = new TestModel('ctor')
        let result = getState(testModel, true)
        expect(JSON.stringify(result)).toBe(JSON.stringify({
            valueProperty: 1,
            valuePlusOne: 2,
            reducedModel: { value: 'child' },
            modelArray: [
                { value: 'one' },
                { value: 'two' }
            ],
            mergedModel: { value: 'merged' },
            subClassProperty: 'subClass',
            constructorProperty: 'ctor',
        }))
    })

    test("includeDerived is not cached between calls", () => {
        let testModel = new TestModel('ctor')
        stringifyState(testModel)
        let result = stringifyState(testModel, true)
        expect(result).toContain('"valuePlusOne":2')
    })
})
