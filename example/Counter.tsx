import { asyncEvent, derived, events, reduce, reduced } from "event-reduce";
import { useReactive } from "event-reduce-react";
import * as React from "react";
import { CounterListEvents } from "./CounterList";

@events
export class CounterEvents {
    constructor(private _parent: CounterListEvents, private _id: number) { }

    incremented = this._parent.incremented.scope({ id: this._id });
    decremented = this._parent.decremented.scope({ id: this._id });
    reset = this._parent.reset.scope({ id: this._id });
    removed = this._parent.counterRemoved.scope({ id: this._id });
    valueFetched = asyncEvent<number>();
}

export class CounterModel {
    constructor(
        public events: CounterEvents,
        private _initial: { id: number, count?: number }
    ) { }

    readonly id = this._initial.id;

    @reduced
    count = reduce(this._initial.count || 0, this.events)
        .on(e => e.incremented, (current) => current + 1)
        .on(e => e.decremented, (current) => current - 1)
        .on(e => e.reset, () => 0)
        .on(e => e.valueFetched.resolved, (_, { result }) => result)
        .value;

    @derived
    get countTimesTwo() { return this.count * 2; }
}

export function Counter({ model }: { model: CounterModel }) {
    let events = model.events;

    return useReactive(`Counter ${model.id}`, () =>
        <div data-testid="counter" style={{ display: 'inline-block', border: '1px solid silver', margin: 8, padding: 8 }}>
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
    );

    function onFetch() {
        events.valueFetched(Promise.resolve(100));
    }
}