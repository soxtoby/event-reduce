import { asyncEvent, derived, events, model, reduce, reduced } from "event-reduce";
import { reactive } from "event-reduce-react";
import * as React from "react";
import { CounterListEvents } from "./CounterList";

@events
export class CounterEvents {
    constructor(private _parent: CounterListEvents, private _scope: { id: number }) { }

    get incremented() { return this._parent.incremented.scope(this._scope); }
    get decremented() { return this._parent.decremented.scope(this._scope); }
    get reset() { return this._parent.reset.scope(this._scope); }
    get removed() { return this._parent.counterRemoved.scope(this._scope); }
    valueFetched = asyncEvent<number>();
}

@model
export class CounterModel {
    constructor(
        public events: CounterEvents,
        private _initial: { id: number, count?: number }
    ) { }

    get id() { return this._initial.id; }

    @reduced
    get count() {
        return reduce(this._initial.count || 0, this.events)
            .on(e => e.incremented, (current) => current + 1)
            .on(e => e.decremented, (current) => current - 1)
            .on(e => e.reset, () => 0)
            .on(e => e.valueFetched.resolved, (_, { result }) => result)
            .value;
    }

    @derived
    get countTimesTwo() { return this.count * 2; }
}

export const Counter = reactive(function Counter({ model }: { model: CounterModel }) {
    let events = model.events;

    return <div data-testid="counter" style={{ display: 'inline-block', border: '1px solid silver', margin: 8, padding: 8 }}>
        <table>
            <tbody>
                <tr>
                    <td>Count</td>
                    <td data-testid="count"><b>{model.count}</b></td>
                </tr>
                <tr>
                    <td>Count x2</td>
                    <td data-testid="countTimesTwo"><b>{model.countTimesTwo}</b></td>
                </tr>
            </tbody>
        </table>
        <div>
            <button onClick={() => events.decremented({})}>-</button>
            <button onClick={() => events.reset({})}>0</button>
            <button onClick={() => events.incremented({})}>+</button>
        </div>
        <div>
            <button onClick={() => onFetch()}>Fetch</button>
            <button onClick={() => events.removed({})}>Remove</button>
        </div>
    </div>

    function onFetch() {
        events.valueFetched(Promise.resolve(100));
    }
});