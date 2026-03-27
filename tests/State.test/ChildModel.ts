import { model, reduce, reduced } from "event-reduce/signals";

// TODO move back into Model.test.ts after https://github.com/oven-sh/bun/issues/28010 is resolved

@model
export class ChildModel {
    constructor(private _initialValue: string) { }

    @reduced
    get value() { return reduce(this._initialValue).value; }
}
