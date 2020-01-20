import { getObservableProperties, getObservableValues } from "./decorators";
import { withInnerTrackingScope } from "./observableValue";
import { getStateProperties } from "./state";
import { isObject, isPlainObject } from "./utils";

export function unsubscribeOldModelsFromSources(oldModel: any, newModel: any) {
    let modelOwner = valueOwner(oldModel);

    if (isModel(oldModel)) {
        if (oldModel != newModel)
            unsubscribeFromSources(oldModel);
    } else if (Array.isArray(oldModel)) {
        if (Array.isArray(newModel)) {
            for (let oldItem of oldModel) {
                if (modelOwner && valueOwner(oldItem) == modelOwner && !newModel.includes(oldItem))
                    unsubscribeFromSources(oldItem);
            }
        } else {
            unsubscribeFromSources(oldModel);
        }
    } else if (isPlainObject(oldModel)) {
        if (isPlainObject(newModel)) {
            Object.entries(oldModel)
                .forEach(([key, oldValue]) => {
                    if (modelOwner && valueOwner(oldModel[key]) == modelOwner && newModel[key] !== oldValue)
                        unsubscribeFromSources(oldValue);
                });
        } else {
            unsubscribeFromSources(oldModel);
        }
    }
}

export function unsubscribeFromSources(model: any) {
    let modelOwner = valueOwner(model);
    removeValueOwner(model);

    if (isModel(model)) {
        Object.values(getObservableValues(model) || {})
            .forEach(observableValue => {
                observableValue.unsubscribeFromSources();
                let value = withInnerTrackingScope(() => observableValue.value);
                if (valueOwner(value) == observableValue)
                    unsubscribeFromSources(value);
            });
        (getStateProperties(model) || [])
            .forEach(stateProp => unsubscribeFromSources(model[stateProp]));
    } else if (Array.isArray(model)) {
        model.forEach(item => {
            if (modelOwner && valueOwner(item) == modelOwner)
                unsubscribeFromSources(item);
        });
    } else if (isPlainObject(model)) {
        Object.values(model).forEach(value => {
            if (modelOwner && valueOwner(value) == modelOwner)
                unsubscribeFromSources(value);
        });
    }
}

function isModel(model: any) {
    return isObject(model)
        && (!!getObservableProperties(Object.getPrototypeOf(model))
            || !!getStateProperties(model));
}

let valueOwners = new WeakMap<any, any>();

export function valueOwner(value: any) {
    return isObject(value)
        ? valueOwners.get(value)
        : undefined;
}

/** Sets value owner if it doesn't already have one */
export function ensureValueOwner(value: any, owner: any) {
    if (isObject(value) && !valueOwners.has(value)) {
        valueOwners.set(value, owner);
        if (Array.isArray(value))
            value.forEach(item => ensureValueOwner(item, owner));
        else if (isPlainObject(value))
            Object.values(value).forEach(val => ensureValueOwner(val, owner));
    }
}

function removeValueOwner(value: any) {
    valueOwners.delete(value);
}