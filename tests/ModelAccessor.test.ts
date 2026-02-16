import { beforeEach, describe, expect, test } from "bun:test";
import { event, extend, model, reduce, reduced } from "event-reduce";

// In a separate file until bun supports the accessor syntax,
// at which point these can be merged back into Model.test.ts

describe("model accessor props", () => {
    let increment: ReturnType<typeof event<void>>;
    let decrement: ReturnType<typeof event<void>>;

    beforeEach(() => {
        increment = event<void>('increment');
        decrement = event<void>('decrement');
    });

    @model
    class TestModel {
        @reduced
        accessor accessorProp = reduce(1)
            .on(increment, c => c + 1)
            .value;
    }

    @model
    class ExtendedModel extends TestModel {
        @reduced
        override accessor accessorProp: number = extend(super.accessorProp)
            .on(decrement, c => c - 1)
            .value;
    }

    let testModel: TestModel;
    let extendedModel: ExtendedModel;

    beforeEach(() => {
        testModel = new TestModel();
        extendedModel = new ExtendedModel();
    });

    test("accessor property has initial value", () => expect(testModel.accessorProp).toBe(1));

    test("extended accessor property has same initial value", () => expect(extendedModel.accessorProp).toBe(1));

    describe("when reduction updated", () => {
        beforeEach(() => {
            increment(undefined);
        });

        test("accessor property value updated", () => expect(testModel.accessorProp).toBe(2));

        test("extended accessor property value updated", () => expect(extendedModel.accessorProp).toBe(2));
    });

    describe("when extended reduction updated", () => {
        beforeEach(() => {
            decrement(undefined);
        });

        test("accessor property value unaffected", () => expect(testModel.accessorProp).toBe(1));

        test("extended accessor property value updated", () => expect(extendedModel.accessorProp).toBe(0));
    });
});