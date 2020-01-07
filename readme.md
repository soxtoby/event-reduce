# ⚡ event-reduce 
A small, opinionated, state management library based on reducing observable events into state.

## Why?
* I like static typing.
* I like how flux separates state and views.
* I like how mobx makes derived state almost completely frictionless.
* I _particularly_ like being able to define a piece of state by how it changes.

## How?
Start by installing the NPM package:
```
yarn add event-reduce
```

Create a model:
```ts
import { event, reduce } from 'event-reduce';

const incremented = event();
const decremented = event();

const counter = reduce(0)
    .on(incremented, count => count + 1)
    .on(decremented, count => count - 1);
```

Trigger events to update the model:
```ts
console.log(counter.value); // 0

incremented();
incremented();

console.log(counter.value); // 2

decremented();

console.log(counter.value); // 1
```

## What if my application is more complicated than a single counter?
I'd recommend putting your events in their own class like this:
```ts
import { event, events } from 'event-reduce';

@events // Makes sure events are named well for debugging
class CounterEvents {
    counterAdded = event();
    incremented = event<{ counterIndex: string, amount: number }>();
}
```
and make a model class like this:
```ts
import { derived, reduce, reduced } from 'event-reduce';

class CounterModel {
    constructor (public events: CounterEvents) { }

    @reduced    // Marks property as reduced, so its value will update automatically
    counters = reduce([] as number[])
        .on(this.events.counterAdded, (counters) => counters.concat([0]))
        .on(this.events.incremented, (counters, { counterIndex, amount }) => counters
            .map((c, i) => i == counterIndex ? c + amount : c))
        .value; // Property will just be the value, rather than a Reduction object

    @derived   // Marks property as derived, which will cache its result until counters are changed
    get counterCount() {
        return this.counters.length;
    }
}
```

Then the model can be used like so:
```ts
let events = new CounterEvents();
let model = new CounterModel(events);

console.log(model.counters); // []
console.log(model.counterCount); // 0

events.counterAdded();
events.counterAdded();

console.log(model.counters); // [0, 0]
console.log(model.counterCount); // 2

events.incremented({ counterIndex: 0, amount: 1 });
events.incremented({ counterIndex: 1, amount: 2 });

console.log(model.counters); // [1, 2]
```
Chances are, your application is going to be even _more_ complicated than even a _list_ of counters 😁. You're going to need more model classes, and you're going to want to scope events to particular child models. I've provided a more complete example in the aptly-name `example` folder.

## How do I connect this to React?
React integration is provided by a separate package, so start by installing that:
```
yarn add event-reduce-react
```
Hooks are provided for creating events, reductions, and derivations that persist between renders. Components that use reduced or derived properties should be wrapped in the `reactive` HOC, so that the component will re-render when the model changes.
```tsx
import { reactive, useEvent, useReduced } from "event-reduce-react";

export const MyComponent = reactive(function MyComponent() {
    let increment = useEvent<number>();
    let count = useReduced(0)
        .on(increment, c => c + 1);

    return <div>
        Count: {count.value}
        <button onClick={() => increment()}>Increment</button>
    </div>
});
```

State can come from model objects instead of using hooks inside your components. The `example` application is implemented this way.

## Can I persist the state of my models?
Yes! If you've got the appropriate decorators on your model properties, they can easily be saved and restored later.
```ts
import { state, reduced, reduce, derived, getState, setState } from "event-reduce";

class MyModel {
    constructor(public events: CounterEvents, id: string) {
        this.id = id;
    }

    @state // Unobservable state that you want to save
    id: string;

    @reduced // Will be saved
    count = reduce(0)
        .on(this.events.incremented, c => c + 1)
        .value;

    @derived // Won't be saved, since it can be re-computed
    get countTimesTwo() {
        return this.count * 2;
    }
}

let model = new MyModel(new CounterEvents(), 'mine');

let state = getState(model); // { id: "mine", count: 0 }
setState(model, state); // Restore the saved state to the model
```

Often, reduced properties will contain more models. Their state will be saved and restored as part of the parent model's state. If you have a reduced collection of models though, you'll need to create new models from the restored state using the `onRestore` function. See the `CounterListModel` class in [example/CounterList.tsx](https://github.com/soxtoby/event-reduce/blob/master/example/CounterList.tsx) for an example.


## How can I debug state changes?
The simplest way to get started is to enable logging:
```ts
import { enableLogging } from "event-reduce";

enableLogging(true);
```
Events and the reductions, derivations, and renders they trigger will be logged to the console, along with useful information such as the parameters passed in to the event, the previous and current values of reductions and derivations, and the sources of reductions, derivations, and renders.
![example console log](/assets/logging-screenshot.png)

event-reduce also has support for time-travelling debugging with the [Redux DevTools](https://github.com/reduxjs/redux-devtools). Make sure you've set up your model for [saving and restoring state](#can-i-persist-the-state-of-my-models), then simply register your top-level model to enable the integration.
```ts
import { enableDevTools } from "event-reduce";
import { myModel } from "./my-model"

enableDevTools(myModel, 'My model'); // name is optional
```
If you've got more than one top-level model, you'll need to register each of them separately.