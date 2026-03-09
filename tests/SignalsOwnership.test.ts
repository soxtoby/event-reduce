import { describe, expect, test } from "bun:test"
import { asModel } from "event-reduce/lib/signals/models"
import { Reduction } from "event-reduce/lib/signals/reduction"
import { SourceBase } from "event-reduce/lib/signals/signals"
import { trackManagedSourceCreation, UntrackedSourceError, updateChildren } from "event-reduce/lib/signals/tracking"

class TestSource<T> extends SourceBase<T> {
    constructor(name: string) { super(name) }
    emit(value: T) { this.setValue(value, true) }
}

describe("signal reduction ownership", () => {
    test("ownerless reduction throws", () => {
        expect(() => new Reduction<number>("r", 0)).toThrow(UntrackedSourceError)
    })

    test("disposes after last owner removed", () => {
        let owner = new TestSource<any>("owner")
        let updates = new TestSource<number>("updates")

        let reduction: Reduction<number>
        {
            using _ = trackManagedSourceCreation()
            reduction = new Reduction<number>("r", 0).on(updates, (current, next) => current + next)
        }

        updates.emit(1)
        expect(reduction.value).toBe(1)

        owner.emit(reduction)
        owner.emit(undefined)

        updates.emit(1)
        expect(reduction.value).toBe(1)
    })

    test("array ownership diffs keep/remove/add owners", () => {
        let holder = new TestSource<any>("holder")
        let updates = new TestSource<number>("updates")
        let r1, r2: Reduction<number>
        {
            using _ = trackManagedSourceCreation()
            r1 = new Reduction<number>("r1", 0).on(updates, (current, next) => current + next)
            r2 = new Reduction<number>("r2", 0).on(updates, (current, next) => current + next)
        }

        holder.emit([r1, r2])
        updates.emit(1)
        expect(r1.value).toBe(1)
        expect(r2.value).toBe(1)

        holder.emit([r2])
        updates.emit(1)
        expect(r1.value).toBe(1)
        expect(r2.value).toBe(2)

        holder.emit([r2, r1])
        updates.emit(1)
        expect(r1.value).toBe(1)
        expect(r2.value).toBe(3)
    })

    test("replacing owned reduction with model disposes reduction", () => {
        let bootstrapOwner = new TestSource<any>("bootstrap")
        let holder = new TestSource<any>("holder")
        let updates = new TestSource<number>("updates")

        let reduction: Reduction<number>
        {
            using _ = trackManagedSourceCreation()
            reduction = new Reduction<number>("r", 0).on(updates, (current, next) => current + next)
        }

        holder.emit(reduction)
        updates.emit(1)
        expect(reduction.value).toBe(1)

        let model = asModel({ reduction })
        holder.emit(model)

        updates.emit(1)
        expect(reduction.value).toBe(1)

        holder.emit(undefined)
        updates.emit(1)
        expect(reduction.value).toBe(1)
    })

    test("disposed reductions do not reactivate when owner is re-added", () => {
        let owner = new TestSource<any>("owner")
        let updates = new TestSource<number>("updates")

        let reduction: Reduction<number>
        {
            using _ = trackManagedSourceCreation()
            reduction = new Reduction<number>("r", 0).on(updates, (current, next) => current + next)
        }

        updates.emit(1)
        expect(reduction.value).toBe(1)

        updateChildren(owner, undefined, reduction)
        updateChildren(owner, reduction, undefined)
        updateChildren(owner, undefined, reduction)

        updates.emit(1)
        expect(reduction.value).toBe(1)
    })
})
