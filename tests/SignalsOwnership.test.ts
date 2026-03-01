import { describe, expect, test } from "bun:test";
import { OwnerlessReductionError, Reduction } from "event-reduce/lib/signals/reduction";
import { SourceBase } from "event-reduce/lib/signals/signals";
import { addSourceOwner, asModel, removeSourceOwner, withOwner } from "event-reduce/lib/signals/tracking";

class TestSource<T> extends SourceBase<T> {
    constructor(name: string) { super(name, () => false); }
    emit(value: T) { this.setValue(value, true); }
}

describe("signal reduction ownership", () => {
    test("ownerless reduction throws", () => {
        expect(() => new Reduction<number>("r")).toThrow(OwnerlessReductionError);
    });

    test("detaches after last owner removed", () => {
        let owner = new TestSource<any>("owner");
        let updates = new TestSource<number>("updates");

        let reduction = withOwner(owner, () =>
            new Reduction<number>("r").on(updates, (current = 0, next) => current + next));

        updates.emit(1);
        expect(reduction.value).toBe(1);

        reduction[removeSourceOwner](owner);

        updates.emit(1);
        expect(reduction.value).toBe(1);
    });

    test("array ownership diffs keep/remove/add owners", () => {
        let bootstrapOwner = new TestSource<any>("bootstrap");
        let holder = new TestSource<any>("holder");
        let updates = new TestSource<number>("updates");

        let r1 = withOwner(bootstrapOwner, () =>
            new Reduction<number>("r1").on(updates, (current = 0, next) => current + next));
        let r2 = withOwner(bootstrapOwner, () =>
            new Reduction<number>("r2").on(updates, (current = 0, next) => current + next));

        r1[removeSourceOwner](bootstrapOwner);
        r2[removeSourceOwner](bootstrapOwner);

        holder.emit([r1, r2]);
        updates.emit(1);
        expect(r1.value).toBe(1);
        expect(r2.value).toBe(1);

        holder.emit([r2]);
        updates.emit(1);
        expect(r1.value).toBe(1);
        expect(r2.value).toBe(2);

        holder.emit([r2, r1]);
        updates.emit(1);
        expect(r1.value).toBe(2);
        expect(r2.value).toBe(3);
    });

    test("model in source value owns reductions inside model", () => {
        let bootstrapOwner = new TestSource<any>("bootstrap");
        let holder = new TestSource<any>("holder");
        let updates = new TestSource<number>("updates");

        let reduction = withOwner(bootstrapOwner, () =>
            new Reduction<number>("r").on(updates, (current = 0, next) => current + next));

        reduction[removeSourceOwner](bootstrapOwner);

        let model = asModel({ reduction });
        holder.emit(model);

        updates.emit(1);
        expect(reduction.value).toBe(1);

        holder.emit(undefined);
        updates.emit(1);
        expect(reduction.value).toBe(1);
    });

    test("withOwner can be used for exceptional explicit ownership", () => {
        let owner = new TestSource<any>("owner");
        let updates = new TestSource<number>("updates");

        let reduction = withOwner(owner, () =>
            new Reduction<number>("r").on(updates, (current = 0, next) => current + next));

        updates.emit(1);
        expect(reduction.value).toBe(1);

        reduction[removeSourceOwner](owner);
        reduction[addSourceOwner](owner);

        updates.emit(1);
        expect(reduction.value).toBe(2);
    });
});
