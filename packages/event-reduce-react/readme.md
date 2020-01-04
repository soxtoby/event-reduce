# ⚡ event-reduce-react ⚛
React integration for event-reduce, a small, opinionated, state management library based on reducing observable events into state.

## Getting Started
Start by installing the package:
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

See [the main event-reduce page](https://github.com/soxtoby/event-reduce) for more information.