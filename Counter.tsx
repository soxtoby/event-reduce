import * as React from 'React';
import { reduce } from './src/reduction';
import { event, Event } from './src/event';
import { reduced, events } from './src/mobx-extensions';
import { computed } from 'mobx';
import { observer } from 'mobx-react';

@events
class RootActions {
    addCounter = event();
    removeCounter = event<{ id: number }>();
    increment = event<{ id: number }>();
    decrement = event<{ id: number }>();
    reset = event<{ id: number }>();
    deserialize = event<RootModel>();
}

let uid = 1;

class RootModel {
    constructor(public actions: RootActions, private _initial: Partial<RootModel>) { }

    @reduced
    counters: CounterModel[] = reduce((this._initial.counters || []).map(c => this.createCounter(c)), this.actions)
        .on(a => a.addCounter, (cs) => cs.concat(this.createCounter({ id: uid++ })))
        .on(a => a.removeCounter, (cs, { id }) => cs.filter(c => c.id != id))
        .value;

    private createCounter(initial: { id: number, count?: number }) {
        return new CounterModel(new CounterActions(this.actions, initial.id), initial);
    }
}

@events
class CounterActions {
    constructor(private _parent: RootActions, private _id: number) { }

    increment = this._parent.increment.scope({ id: this._id });
    decrement = this._parent.decrement.scope({ id: this._id });
    reset = this._parent.reset.scope({ id: this._id });;
    fetchValue = event<Promise<number>>();
}

class CounterModel {
    constructor(public actions: CounterActions, private _initial: { id: number, count?: number }) { }

    id = this._initial.id;

    @reduced
    count = reduce(this._initial.count || 0, this.actions)
        .on(a => a.increment, (current) => current + 1)
        .on(a => a.decrement, (current) => current - 1)
        .on(a => a.reset, () => 0)
        .value;

    @computed
    get countPlusOne() { return this.count + 1; }
}

interface ICounterProps {
    increment?: Event;
    decrement?: Event;
    reset?: Event;
    fetchValue?: Event<Promise<number>>;

    count?: number;
}

@observer
export class Counter extends React.Component<ICounterProps> {
    render() {
        let actions = { ...this.props };
        let model = { ...this.props }
        return <div>
            <span>{model.count}</span>
            <button onClick={actions.increment}>+</button>
            <button onClick={actions.decrement}>-</button>
            <button onClick={actions.reset}>0</button>
            <button onClick={() => actions.fetchValue && actions.fetchValue(Promise.resolve(100))}>Fetch</button>
        </div>;
    }
}