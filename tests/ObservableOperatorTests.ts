import { SynchronousPromise } from "synchronous-promise";
import { it, test } from "wattle";
import { IObservable, Observable } from "../src/observable";
import './setup';

export function testObservableOperators() {
    test("filter", () => {
        let source = observableOf(1, 2, 3, 2, 1);
        let result = source.filter(v => v > 1);
        values(result).should.have.members([2, 3, 2]);
    });

    test("map", () => {
        let source = observableOf(1, 2, 3);
        let result = source.map(v => v * 2);
        values(result).should.have.members([2, 4, 6]);
    });

    test("resolved", () => {
        let source = observableOf(
            SynchronousPromise.resolve(1),
            SynchronousPromise.reject<number>(2),
            SynchronousPromise.unresolved<number>(),
            SynchronousPromise.resolve(4));
        let result = source.resolved();
        values(result).should.have.members([1, 4]);
    });

    test("rejected", () => {
        let source = observableOf(
            SynchronousPromise.resolve(1),
            SynchronousPromise.reject<number>(2),
            SynchronousPromise.unresolved<number>(),
            SynchronousPromise.reject<number>(4));
        let result = source.rejected();
        values(result).should.have.members([2, 4]);
    });

    test("asObservable", () => {
        it("returns a new observable", () => {
            let source = observableOf(1);
            let result = source.asObservable();
            result.should.not.equal(source);
        });

        it("passes through values", () => {
            let source = observableOf(1, 2, 3);
            let result = source.asObservable();
            values(result).should.have.members([1, 2, 3]);
        });
    });

    test("subscribeInner", () => {
        let source = observableOf(
            observableOf(1),
            observableOf(2),
            observableOf(3),
            observableOf(4)
        );
        let result = source.subscribeInner();

        values(result).should.have.members([1, 2, 3, 4]);
    });

    function observableOf<T>(...args: T[]) {
        return new Observable<T>(observer => {
            args.forEach(a => observer.next(a));
            return {
                unsubscribe: () => { },
                closed: false
            };
        });
    }

    function values<T>(observable: IObservable<T>) {
        let values = [] as T[];
        observable.subscribe(value => values.push(value));
        return values;
    }
}