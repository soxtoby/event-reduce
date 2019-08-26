import { derived, event, events, reduce, reduced } from 'event-reduce';
import { observer } from 'mobx-react';
import * as React from 'React';

@events
class RootEvents {
    counterAdded = event();
    counterRemoved = event<{ id: number }>();
    incremented = event<{ id: number }>();
    decremented = event<{ id: number }>();
    reset = event<{ id: number }>();
}

let uid = 1;

class RootModel {
    constructor(public events: RootEvents) { }

    @reduced
    counters = reduce([] as CounterModel[], this.events)
        .on(a => a.counterAdded, (cs) => cs.concat(this.createCounter({ id: uid++ })))
        .on(a => a.counterRemoved, (cs, { id }) => cs.filter(c => c.id != id))
        .value;

    private createCounter(initial: { id: number, count?: number }) {
        return new CounterModel(new CounterEvents(this.events, initial.id), initial);
    }
}

@events
class CounterEvents {
    constructor(private _parent: RootEvents, private _id: number) { }

    increment = this._parent.incremented.scope({ id: this._id });
    decrement = this._parent.decremented.scope({ id: this._id });
    reset = this._parent.reset.scope({ id: this._id });
    fetchValue = event<Promise<number>>();
    remove = this._parent.counterRemoved.scope({ id: this._id });
}

class CounterModel {
    constructor(
        public events: CounterEvents,
        private _initial: { id: number, count?: number }
    ) { }

    readonly id = this._initial.id;

    @reduced
    count = reduce(this._initial.count || 0, this.events)
        .on(a => a.increment, (current) => current + 1)
        .on(a => a.decrement, (current) => current - 1)
        .on(a => a.reset, () => 0)
        .value;

    @derived
    get countPlusOne() { return this.count + 1; }
}

@observer
class CounterList extends React.Component {
    private _events = new RootEvents();
    private _model = new RootModel(this._events);

    render() {
        return <div>
            {this._model.counters.map(c => <Counter key={c.id} model={c} />)}
            <button onClick={this._events.counterAdded}>Add</button>
        </div>;
    }
}

@observer
class Counter extends React.Component<{ model: CounterModel }> {
    render() {
        let model = this.props.model;
        let events = model.events;
        return <div style={{ border: '1px solid silver', margin: 8 }}>
            <div>{model.count}</div>
            <div>+1 = {model.countPlusOne}</div>
            <button onClick={events.increment}>+</button>
            <button onClick={events.decrement}>-</button>
            <button onClick={events.reset}>0</button>
            <button onClick={() => events.fetchValue && events.fetchValue(Promise.resolve(100))}>Fetch</button>
            <button onClick={events.remove}>Remove</button>
        </div>;
    }
}