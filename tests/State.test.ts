import { describe, expect, test } from "bun:test";
import { getState, stringifyState } from "event-reduce";
import { TestModel } from "./State.test/TestModel";

describe("state", () => {
    test("getState copies the correct properties", () => {
        let testModel = new TestModel('ctor');
        let result = getState(testModel);
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
        }));
    });

    test("stringifyState can include derived properties", () => {
        let testModel = new TestModel('ctor');
        let result = stringifyState(testModel, true);
        expect(result).toBe(JSON.stringify({
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
        }));
    });

    test("stringifyState includeDerived is not cached between calls", () => {
        let testModel = new TestModel('ctor');
        stringifyState(testModel);
        let result = stringifyState(testModel, true);
        expect(result).toContain('"valuePlusOne":2');
    });
});
