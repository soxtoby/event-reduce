import { derive, derived, IEvent, model, reduce, reduced } from "event-reduce/src/signals";

// TODO move back into Model.test.ts after https://github.com/oven-sh/bun/issues/28010 is resolved

@model
export class TestModel {
    constructor(public increment: IEvent<void>) { }

    @reduced
    get property() {
        return reduce(1)
            .on(this.increment, c => c + 1)
            .value;
    }

    @reduced
    get dependentProperty() {
        return reduce(1)
            .on(derive(() => this.property), (_, p) => p)
            .value;
    }

    @derived
    get derivedProperty() {
        return this.property * 2;
    }

    @derived
    get bool() { return true; }

    @reduced
    get basedOnDerivedProperty() {
        return reduce(0)
            .on(derive(() => this.derivedProperty), (_, d) => d)
            .value;
    }
}