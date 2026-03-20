import { derive, derived, event, model, reduce, reduced } from "event-reduce/src/signals";

// TODO move back into Model.test.ts after https://github.com/oven-sh/bun/issues/28010 is resolved

export let increment = event('increment')

@model
export class TestModel {
    @reduced
    get property() {
        return reduce(1)
            .on(increment, c => c + 1)
            .value;
    }

    @reduced
    accessor accessorProp = reduce(1)
        .on(increment, c => c + 1)
        .value;

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