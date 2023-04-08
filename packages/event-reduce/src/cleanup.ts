import { log } from "./logging";
import { getObservableValues, getStateProperties, isModel } from "./models";
import { ObservableValue } from "./observableValue";
import { isPlainObject, nameOfFunction } from "./utils";

/** value -> owners */
const ownerRegistry = new WeakMap<TrackableValue, Set<TrackableValue>>();

type Model = object;
type TrackableValue = Model | ObservableValue<unknown>;

export function changeOwnedValue(owner: TrackableValue, oldValue: unknown, newValue: unknown) {
    if (oldValue !== newValue) {
        let oldTrackableValues = findTrackableValues(oldValue);
        let newTrackableValues = findTrackableValues(newValue);

        for (let oldValue of oldTrackableValues)
            if (!newTrackableValues.has(oldValue))
                removeOwner(owner, oldValue);

        for (let newValue of newTrackableValues)
            if (!oldTrackableValues.has(newValue))
                addOwner(owner, newValue);
    }
}

function addOwner(owner: TrackableValue, value: TrackableValue) {
    ownerRegistry.get(value)?.add(owner)
        ?? ownerRegistry.set(value, new Set([owner]));
}

function removeOwner(owner: TrackableValue, value: TrackableValue) {
    let owners = ownerRegistry.get(value);
    owners?.delete(owner);
    if (!owners?.size)
        disposeModel(value);
}

export function disposeModel(model: Model) {
    log('🗑️ (dispose)', nameOfFunction(model.constructor), [], undefined, () => {
        ownerRegistry.delete(model);
        if (model instanceof ObservableValue) {
            model.dispose();
        } else if (isModel(model)) {
            for (let value of Object.values(getObservableValues(model)))
                removeOwner(model, value);
            for (let key of getStateProperties(model))
                changeOwnedValue(model, model[key as keyof unknown], undefined);
        }
    });
}

function findTrackableValues(value: unknown, trackableValues: Set<TrackableValue> = new Set(), searchedIn: Set<unknown> = new Set()) {
    if (!searchedIn.has(value)) {
        searchedIn.add(value);

        if (value instanceof ObservableValue || isModel(value)) {
            trackableValues.add(value);
        } else if (Array.isArray(value)) {
            for (let item of value)
                findTrackableValues(item, trackableValues, searchedIn);
        } else if (isPlainObject(value)) {
            for (let key in value)
                findTrackableValues(value[key as keyof unknown], trackableValues, searchedIn);
        }
    }

    return trackableValues;
}