import { model, state } from "event-reduce/signals";
import { BaseModel } from "./BaseModel";

// TODO move back into Model.test.ts after https://github.com/oven-sh/bun/issues/28010 is resolved

@model
export class TestModel extends BaseModel {
    @state
    subClassProperty = 'subClass';
}
