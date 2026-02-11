import { derive } from 'event-reduce/lib/derivation';
import { ObservableValue } from 'event-reduce/lib/observableValue';
import { describe, test } from 'wattle';

describe("Derivation recursion protection", () => {
    // Reproduces the DimensionTreeNodeModels.ts stack overflow scenario:
    //
    // Setup: parent.visibleChildren (derived, returns new array) depends on
    //        child[i].matchesFilter (derived, boolean) for N children,
    //        where each child depends on the same shared filter source.
    //
    // When the filter changes, sharedSource notifies child0 first.
    // child0 updates → setValue → notifyObservers → parent.onSourceValueChanged
    // → parent.reconcile → parent.update (sets _state = 'invalid')
    // → parent's derive accesses child1.value → child1.reconcile → child1.update
    // → child1.setValue → notifyObservers → parent.onSourceValueChanged
    // → parent.reconcile → sees _state == 'invalid' → calls parent.update() AGAIN
    //
    // This nests N-1 levels deep (one re-entry per child whose value changes
    // during parent's derive function), blowing the stack with enough children.
    //
    // The _isUpdating guard in reconcile() prevents the re-entrant update.

    test("observed parent does not re-enter update when child sources notify during derive", () => {
        let parentComputeCount = 0;
        const childCount = 50;

        const sharedSource = new ObservableValue(() => 'sharedFilter', false);

        // N children that all depend on sharedSource; value changes when source flips
        const children = Array.from({ length: childCount }, (_, i) =>
            derive(() => sharedSource.value ? i : -1, `child${i}`)
        );

        // Parent iterates all children, returning a new array each time
        const parent = derive(() => {
            parentComputeCount++;
            return children.map(c => c.value);
        }, 'parent');

        // Subscribe so parent.isObserved = true (triggers auto-reconcile on notify)
        parent.subscribe(() => {});

        // Force initial evaluation to wire up all subscriptions
        const initial = parent.value;
        initial.should.have.length(childCount);
        initial[0]!.should.equal(-1);

        parentComputeCount = 0;

        // Flip the shared source — every child's value changes.
        // Without _isUpdating guard: parentComputeCount == childCount (nested re-entries)
        // With _isUpdating guard: parentComputeCount == 1
        sharedSource.setValue(true);

        parentComputeCount.should.be.lessThan(5);

        // Value should be correct
        const result = parent.value;
        result[0]!.should.equal(0);
        result[childCount - 1]!.should.equal(childCount - 1);
    });
});
