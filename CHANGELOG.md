# Changelog

## Unreleased

## v0.9.5

### Fixed
- Calling an `IAsyncEvent` returns the same promise type that was passed in, such as `Promise<T>`, instead of `PromiseLike<T>`.
- `useModel` and `useReduced` no longer stop updating when React cleans up their effects and runs them again, such as in Strict Mode or when an `<Activity>` is hidden and shown again. They create a new model or reduction instead, so state isn't kept while an `<Activity>` is hidden.

## v0.9.4

### Fixed
- Importing certain internal modules before the main `event-reduce` entry point no longer throws because of an undefined constructor.

## v0.9.3

### Fixed
- Removing many models at once, such as clearing a long list, no longer throws `RangeError: Maximum call stack size exceeded`.

## v0.9.2

### Changed
- Reading a reduction, derivation, or signal after it's disposed returns its last value, instead of throwing `DisposedObservableError` in development. This means removed models can still be read, such as by a deferred render or a log. A disposed observable no longer updates, and reading it doesn't make it a source.
- In development, storing a disposed model or observable in a reduction, derivation, signal, or model throws `StoredAfterDisposalError`, since it no longer updates.

### Fixed
- A disposed observable no longer keeps its sources or callbacks alive, so it can't keep other models alive just because something still holds it.
- A mapped, filtered, or merged observable disposed while it has observers stops observing its sources.
- Bun now loads the compiled `lib` files, like other runtimes, instead of the packages' TypeScript sources.

## v0.9.1

### Changed
- In development, a derivation or reducer throws `UnownedModelError` when a model it creates has no owner, such as a model in an array inside a returned object. A derivation or reduction only owns models in its value that are the value itself, in an array, or a property of an object.

### Fixed
- In development, React's props diff no longer throws `DisposedObservableError` when a re-rendered component's previous props hold a model that has since been disposed, such as an item removed from an array prop.

## v0.9.0

### Breaking
- `IObservable.lastUpdated` is replaced by `lastChanged`, the iteration the observable's value last changed in. `IObservable` also has a new `updateIfStale()` method, so custom implementations need both. Classes extending `Observable` already have them.

### Changed
- In development, a merge or reduction throws `SourcesChangedTogetherError` when two of its sources change in the same update, since the order they're handled in isn't reliable.
- In development, reading a reduction, derivation, or signal after it's disposed throws `DisposedObservableError`. This usually means something is still using a model that has been removed from its owner.
- In development, `createModel` throws `ObservableModelError` when its function returns an observable, since a model is a plain object with observable properties, such as `createModel(() => ({ count: reduce(0) }))`. Its type rejects an observable too.

### Fixed
- A derivation with an unobserved source, such as another derivation, returns the latest value after an event changes that source, even if the derivation was read earlier in the same event.
- An observed derivation whose sources depend on several reductions updated by the same event sees all of their new values, and a reduction observing it is only notified of the final value.
- An observed derivation that reads a reduction before the reduction handles an event no longer recalculates when that event fires again without changing the reduction.
- A mapped observable read by an earlier observer of its source, while the source is notifying, notifies its own observers once, with the up-to-date value.
- A map, merge, or reduction that starts observing a source while that source is notifying no longer handles the change in progress, so a model created in a reducer doesn't reduce the event that created it.
- `disposeModel` disposes a model, and the child models only it owns, straight away when called outside a transition, instead of when the next transition ends.
- Disposing a model made by `createModel` no longer disposes observables it shares with other models.
- Reduced and derived properties overridden with `mutable` keep their override when their sources change.
- Assigning an event or events class to a `modelProxy` property no longer throws `InvalidStateError`.
- With `enableDevTools`, a render or derivation triggered by a change to a derivation or another observable no longer throws. It sends the changed observable's path as `trigger`.
- `enableDevTools` no longer overwrites the `type` of an event's value.

## v0.8.0

This version is a complete rewrite to a signals-based implementation. The core APIs are mostly compatible, but there's lots of changes around the edges.

### Observables
- `getDisplayName` callbacks have been replaced with plain string values. `displayName` is a plain string property instead of a getter function. Added `IObservable.setDisplayName` for updating display names if necessary.
- `subscribe` method takes in an `IObserver` object, and rather than returning an unsubscribe function, `IObservable.unsubscribe` should be called with the same observer.
- Added a `filter` overload for filtering with a type guard, which will return an `IObservable` of the narrowed type.
- `Observe` function type has been replaced with the `IObserver` interface.
- `sources` property changed to `getSources` method, which returns an iterable.
- Added `IObservable.path` getter, which returns the path to the observable from the root of the model. This is useful for debugging and logging purposes.
- Added `IObservable.lastUpdated` property, which returns the number of the last iteration in which the observable was updated. This is mostly for internal use, but should be useful for debugging.
- `merge` returns an `IObservable` of a union of the input types instead of requiring all inputs to be the same type.
- `Observable` and `allSources` are no longer exported from the main module, but are still available from the event-reduce/lib/observable module.
- `IObservableValue` has been removed. Use `IReduction` or `IDerivation` instead.
- Replaced `Subject` and`ISubject` with `signal` and `ISignal`.
- Added `Effect` class for running side effects when accessed values are updated. Should be used sparingly, for interfacing with other systems.

### Reductions
- Removed the built-in state restoration and `onRestore` handler (see [State](#state)).
- Removed `onValueChanged`, which was previously marked as deprecated.
- Merged `IBoundReduction` into `IReduction`.
- You can now access other observable values in a reducer function, even if they depend on the event being fired, and they will be up-to-date. An exception will be thrown in the event of a circular dependency.
- `extend` function has been replaced with `extendReduce`, which allows you to extend any observable value as a reduction.
- Creating a reduction outside of a model or `useReduced` will throw, to avoid memory leaks. You can use `createModel` to create a top-level model to hold your reductions.

### Events
- `IAsyncEvent` is now an `IObservable<AsyncValue>`, and `AsyncValues` have a `phase` property indicating the type of event. The `started`, `resolved`, and `rejected` properties still exist, but they are now just filters for the main event stream instead of separate sources.
- Added `IAsyncEvent.filterContext`, which filters on the context, and returns an `IAsyncObservable`.
- `IAsyncEvent.filter` is now just the base `IObservable.filter`, so it filters on the entire `AsyncValue` union type, and returns a plain `IObservable`.
- `IAsyncObservables` renamed to `IAsyncObservable` since it is now itself observable.
- Removed `IEventBase`. Use `IObservable` or `IEventFunction` instead.
- Removed `IFilterableAsyncObservables`. Use `IAsyncObservable` and its `filterContext` method instead.
- Removed `fireEvent` and `makeEventFunction`. Use `makeEvent`, `makePhasedEvent`, and `startLogging` instead. See the `event` and `asyncEvent` implementations for examples.

### Models
- Classes that use the `@reduced`, `@derived`, or `@state` decorators _must_ be decorated with `@model`.
- Added `createModel` function for creating ad-hoc top-level models.

### State
- Removed `setState` - restoring from a state snapshot must now be handled manually. In practice, it turned out most state-restoration logic was in model class constructors, and automatic state restoration was rarely useful.
- `getState` is now memoized, and invalidated similar to any other derived value, making it a _lot_ faster for large object graphs.
- `getState` will call `toJSON` on any objects it encounters, so you can override the default state behavior.

### Utilities
- Removed `Unsubscribe` type, `NamedBase` class, and `filteredName` function.

### React Hooks
- Removed `useObservedProps`. Update models in `useEffect` instead.
- Removed `useObserved`. Use `useSignal` instead, and update it in `useEffect`.

## v0.7.4

- Fixed a bug where source derivations could trigger a derivation to update while it was already updating.

## v0.7.3

- Fixed typing for new-style derived decorator on boolean properties

## v0.7.2

- Fixes for legacy decorators.

## v0.7.1

- Support for new decorator syntax (in addition to legacy syntax).
  - `@reduced` on auto-accessor properties and getters.
  - `@derived` on getters.
  - `@state` on fields, auto-accessor properties, and getters.
  - `@state('param')` on classes, for marking constructor properties as state.
  - `@model` and `@events` on classes.
- `@model` is required on class when new `@reduced`, `@derived`, or `@state` decorators are used.

## v0.7.0

- Improved performance and memory usage.
- Disabled expensive validation in production.
- Fixed rendering in React strict mode.
- `Derivation.unsubscribeFromSources` no longer clears list of sources.
- `useModel`, `useDerived`, and `useReduced` no longer dispose their value on "unmount".
- Removed `notifyObservers` parameter from `ObservableValue.setValue`.
- Support for `@reduced` decorator on getter properties.
- Events returned from getters in `@events` classes are memoized.
- Fixed disposing mutable models.

## v0.6.0

- New derivation invalidation logic ensures that derivations always get the latest values from their sources.
- `IObservableValue<T>` once again implements `IObservable<T>`, and `values` property has been removed.
- Replaced `PromiseQueue` with `MicrotaskQueue`.
- Derivations take in an optional `valuesEqual` function to determine if the values have changed.
- Added optional dependencies parameter to `useModel()` to allow the model to be recreated when the dependencies change.
- Events and event classes will produce errors if used directly as state. They can still be part of models that are in state.
- Removed the deprecated `readonly` property on mutable models.

### Logging improvements
- Improved logging performance.
- Improved logging for react components.
- Fixed a memory leak where all sources were being held onto by logs.
- All logs are collapsed by default.
- Built-in "restored" event is not logged as a source for reductions.

## v0.5.0

- `IObservable`s are now `Disposable`. The `[Symbol.dispose]` method cleans up both sources and observers.
- `ObservableValue`s can have multiple "owners", and are disposed once removed from every owner.
- Improved type definitions for `State<T>` and `Scoped<T, Scope>`.
- `Subject` takes in a `getDisplayName` parameter, similar to other observables.
- Added `IObservable.filterMap()`, which allows selecting something from inside an event, and only passing it along if it was found.
- Derivations log the source that invalidated them when they re-calculate.
- `useDerived` re-calculates every render unless external dependencies are specified and haven't changed.
- Derived props in model proxies are now calculated correctly when a source prop has been overridden on the proxy.
- Better logging for React elements by `reactive` and `useReactive`.
- Performance improvements for disposing models and serializing state.

### Breaking changes
- `IEvent` and `IAsyncEvent` return the value that was passed into them.
- Derivations no longer re-calculate immediately when a dependency changes. Instead, they're invalidated, and re-calculated on next access.
- `IObservableValue<T>` now implements `IObservable<void>` and fires when the value is _invalidated_. To subscribe to changes of the actual value, use the `values` property.
- Removed `watch` and `IWatcher` now that derivations can be subscribed to without the value being re-calculated.
- `matchesScope` requires that `scope` is an `object`, similar to `IEvent.scope`.
- `Subject` no longer allows different "in" and "out" types.
- Triggering an event in a derivation is now an error.
- `reactive` component props are no longer observable. Use the `useObservedProps` hook instead if neccessary.
- `reactive` is now just a thin wrapper around `useReactive`, and no longer applies `memo` or `forwardRef` to the component.
