# Event Reduce

Event Reduce models state as values computed from observable event streams and observable state.

## Language

**Observable**:
A value-producing node that can be observed and composed.
_Avoid_: Source when naming the node itself.

**Source**:
The relationship role of an **Observable** used to compute another **Observable**.
_Avoid_: Observable source as a type name.

**ObservableValue**:
An **Observable** that stores a mutable value.
_Avoid_: Atom.

**State**:
A non-observable value that is included in a model's state.
_Avoid_: ObservableValue.

## Relationships

- An **Observable** may have zero or more **Sources**.
- A **Source** is always an **Observable**.
- An **ObservableValue** is an **Observable**.
- **State** is not an **ObservableValue**.
- APIs that describe dependency relationships should use "source" language.
- Observer callbacks should use "source" language when the changed **Observable** is one of the observer's dependencies.
- Effects should use "source" language for observables they read and for the observable that invalidates them.
- Modules that define observable node types should use "observable" language, not "source" language.
- `Source` and `ISource` should not remain as aliases after the rename; they preserve branch-local drift, not compatibility.
- Specialized observable classes should use "Observable" in the class name.
- Type aliases and interfaces should use "Observable" when they name an observable node concept.
- Async event interfaces should use "Observable" when naming the event stream itself or its phase streams.
- Event functions keep event-function naming even though they are observable.
- Async events keep async-event naming; do not rename `IAsyncEvent`.
- Variables should use "source" only when the value is acting as a dependency of another **Observable**.
- Transition internals such as `iterationSource` may keep existing names when they are not part of the public naming cleanup.
- Error class names should use "Observable" when they name the observable node concept.
- Error properties should use `source` only when the property identifies the source or trigger of the error.
- Helpers that return the observable node behind a value should use "Observable" language.
- Code comments and tests should use "observable" for user-facing streams and "source" only for dependency roles; the README is out of scope for this branch cleanup.
- Public helper parameters should use "observable" language when callers pass observable nodes directly.
- Dependency graph access uses `getSources()` returning an iterable; restoring master's `sources` property is not required.
- Observable implementations should expose dependency graph access through `getSources()`, not public mutable `sources` sets.
- Observer/effect implementations should not expose public mutable source sets.
- Subscription uses branch-style observer objects; restoring master's callback subscription is not required.
- `IObserver` remains the counterpart to `IObservable`; source-specific behavior belongs in method names.
- `IObserver` should remain minimal and should not require source introspection.
- ObservableValue uses branch-style mutation mechanics; restoring master's old helpers is not required.

## Example dialogue

> **Dev:** "Should this type be called Source?"
> **Domain expert:** "No. It is an Observable. It is only a source when another Observable depends on it."

## Flagged ambiguities

- "source" was used on this branch both as the observable node type and as a dependency role; resolved: restore the master-compatible public type name **Observable**, and reserve **Source** for the dependency role.
- `getSources` and `sourceUpdated` are relationship names, not type names.
- `Effect.sources` and `Effect.invalidatingSource` are dependency-role names.
- `Effect` should keep source terminology internally but not expose a public mutable `sources` set.
- `Reduction` should keep source terminology internally but expose dependencies through `getSources()`.
- The module defining observable node concepts should keep the master-compatible `observable` name.
- The bound transform implementation is **BoundObservable**, not BoundSource.
- Names like `ObservableValue`, `MergedObservables`, and `IAsyncObservable` name concepts; names like `sources` and `getSources` name dependency relationships.
- `ObservedValue` names the value type produced by an **Observable**; **ObservableValue** names the mutable value class.
- Generic type parameters may use concept names directly, e.g. `ObservedValue<Observable>`.
- `allSources(observable)` returns the root **Observable** plus all transitive **Sources**.
- `IAsyncObservable` names an async event observable with phase observables.
- `IEventFunction` extends `IObservable`; it does not need "Observable" in its own name.
- `IAsyncEvent` remains the async event concept.
- Use `observable` for a node being inspected generally; use `source` for a node reached through `getSources` or passed to `sourceUpdated`.
- Rename error classes away from Source when they name concepts, but keep `source` properties when they identify causal sources.
- `NoUnderlyingObservableError` pairs with `getUnderlyingObservable`; avoid `NotAnObservableValueError` because **ObservableValue** is a specific class.
- `InvalidStateError` keeps state language; its invalid state holder property is `observable`, not `source`.
- `StateChangeOutsideTransitionError.source` is valid because the observable is both the state container and the source of the error; only its implementation wording should say "custom observable implementation".
- `getUnderlyingObservable` returns an **Observable** node, not a source relationship.
- Test descriptions can say "observable"; local variables can say `source` when the observable is used as a dependency.
- Event factory docs should say "observable for each phase", not "source for each phase".
- `merge` takes an array parameter named `observables`; it may keep a display-name overload, but should not expose a `sources` parameter.
- The merge return type is **MergedObservables**, not MergedSources.
- Compatibility goal is to restore observable naming, not every master API shape.
- Public export order is not a compatibility requirement.
- Generated or built `lib` output is out of scope for this naming cleanup.
- Public export surface should not change beyond the agreed renames.
- `Observable` naming does not imply master's old `subscribe(callback)` API.
- `IObserver.sourceUpdated` carries the dependency-graph semantics without renaming the observer type.
- Classes that track sources may expose their own introspection, but that is not part of `IObserver`.
- The mutable value primitive should use master's **ObservableValue** name, not Atom.
- The mutable value primitive module should use master's `observableValue` name.
- Tests should use public concept names; ObservableValue tests should not keep Atom naming.
- `ObservableValue.setValue` is acceptable even though the class name is restored for compatibility.
- Model **State** names non-observable values included in model state; do not rename state concepts to ObservableValue.
