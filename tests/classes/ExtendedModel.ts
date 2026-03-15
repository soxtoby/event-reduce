import { extendReduce, IEvent, model, reduced } from "event-reduce/src/signals";
import { TestModel } from "./TestModel";

// TODO move back into Model.test.ts after https://github.com/oven-sh/bun/issues/28010 is resolved

@model
export class ExtendedModel extends TestModel {
    constructor(increment: IEvent<void>, public decrement: IEvent<void>) { super(increment); }

    @reduced
    override get property() {
        return extendReduce(super.property)
            .on(this.decrement, c => c - 1)
            .value;
    }
}