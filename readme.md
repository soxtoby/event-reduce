# ⚡ event-reduce 
A state management based on reducing observable events into state.

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

@events // Marks event methods as mobx actions
class CounterEvents {
    counterAdded = event();
    incremented = event<{ counterIndex: string, amount: number }>();
}
```
and make a model class like this:
```ts
import { reduce, reduced } from 'event-reduce';
import { computed } from 'mobx';

class CounterModel {
    constructor (public events: CounterEvents) { }

    @reduced    // Makes property a mobx observable
    counters = reduce([] as number[])
        .on(this.events.counterAdded, (counters) => counters.concat([0]))
        .on(this.events.incremented, (counters, { counterIndex, amount }) => counters
            .map((c, i) => i == counterIndex ? c + amount : c))
        .value; // Property will just be the value, rather than a Reduction object

    @computed   // mobx will cache this until counters are changed
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