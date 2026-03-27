import { event, extendReduce, model, reduced } from "event-reduce/signals";
import { TestModel } from "./TestModel";

// TODO move back into Model.test.ts after https://github.com/oven-sh/bun/issues/28010 is resolved

export let decrement = event('decrement')

@model
export class ExtendedModel extends TestModel {
    @reduced
    override get property() {
        return extendReduce(super.property)
            .on(decrement, c => c - 1)
            .value
    }

    @reduced
    override accessor accessorProp = extendReduce(super.accessorProp)
        .on(decrement, c => c - 1)
        .value
}
