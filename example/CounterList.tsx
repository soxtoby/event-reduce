import { event, events, reduce, reduced } from "event-reduce";
import { Derived } from "event-reduce-react";
import * as React from "react";
import { Counter, CounterEvents, CounterModel } from "./Counter";

@events
export class CounterListEvents {
    counterAdded = event();
    counterRemoved = event<{ id: number }>();
    incremented = event<{ id: number }>();
    decremented = event<{ id: number }>();
    reset = event<{ id: number }>();
}

let uid = 1;

export class CounterListModel {
    constructor(public events: CounterListEvents) { }

    @reduced
    counters = reduce([] as CounterModel[], this.events)
        .on(e => e.counterAdded, (cs) => cs.concat(this.createCounter({ id: uid++ })))
        .on(e => e.counterRemoved, (cs, { id }) => cs.filter(c => c.id != id))
        .value;

    private createCounter(initial: { id: number, count?: number }) {
        return new CounterModel(new CounterEvents(this.events, initial.id), initial);
    }
}

export function CounterList({ model }: { model: CounterListModel; }) {
    return <Derived>{() =>
        <>
            <div>
                <button onClick={() => model.events.counterAdded()}>Add Counter</button>
            </div>
            {model.counters.map(c => <Counter key={c.id} model={c} />)}
        </>
    }</Derived>;
}
