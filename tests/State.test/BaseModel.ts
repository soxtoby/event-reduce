import { derived, model, reduce, reduced, state } from "event-reduce";
import { ChildModel } from "./ChildModel";

// TODO move back into Model.test.ts after https://github.com/oven-sh/bun/issues/28010 is resolved

@model
@state('constructorProperty')
export class BaseModel {
    constructor(public constructorProperty: string) { }

    @reduced
    get valueProperty() { return reduce(1).value; }

    @derived
    get valuePlusOne() { return this.valueProperty + 1; }

    func() { }

    @reduced
    get reducedModel() { return reduce(new ChildModel('child')).value; }

    @reduced
    get modelArray() {
        return reduce([new ChildModel('one'), new ChildModel('two')])
            .value;
    }

    @state
    mergedModel = new ChildModel('merged');

    ignoredValue = 'ignored';
}
