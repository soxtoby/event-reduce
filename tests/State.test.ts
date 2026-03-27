import { describe, expect, test } from "bun:test";
import { getState } from "event-reduce/signals";
import { TestModel } from "./State.test/TestModel";

describe("state", () => {
    test("getState copies the correct properties", () => {
        let testModel = new TestModel('ctor');
        let result = getState(testModel);
        expect(JSON.stringify(result)).toBe(JSON.stringify({
            subClassProperty: 'subClass',
            constructorProperty: 'ctor',
            valueProperty: 1,
            valuePlusOne: 2,
            reducedModel: { value: 'child' },
            modelArray: [
                { value: 'one' },
                { value: 'two' }
            ],
            mergedModel: { value: 'merged' },
        }));
    });
});
