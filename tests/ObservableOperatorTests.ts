import { SynchronousPromise } from "synchronous-promise";
import { it, test } from "wattle";
import { IObservable, Observable } from "../src/observable";
import './setup';
import sinon = require("sinon");

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

    test("merge", () => {
        let source = observableOf(
            observableOf(1),
            observableOf(2),
            observableOf(3),
            observableOf(4)
        );
        let result = source.merge();

        values(result).should.have.members([1, 2, 3, 4]);
    });

    test("errored", () => {
        let errorMessage = "error message";
        let source = observableOf(
            new Observable<number>(observer => {
                observer.error(errorMessage);
                return emptyUnsubscribe();
            }),
            observableOf(2));
        let result = source.errored();

        values(result).should.have.members([errorMessage]);
    });

    test("completed", () => {
        let unresolvedPromise = SynchronousPromise.unresolved<number>();
        let completedSpy = sinon.spy();
        let source = observableOf(new Observable<number>(observer => {
            unresolvedPromise.then(v => observer.complete());
            return emptyUnsubscribe();
        }));

        let result = source.completed();
        result.subscribe(o => completedSpy());
        completedSpy.should.not.have.been.called;
        unresolvedPromise.resolve();
        completedSpy.should.have.been.called;
    });

    function observableOf<T>(...args: T[]) {
        return new Observable<T>(observer => {
            args.forEach(a => observer.next(a));
            return emptyUnsubscribe();
        });
    }

    function emptyUnsubscribe() {
        return {
            unsubscribe: () => { },
            closed: false
        }
    }

    function values<T>(observable: IObservable<T>) {
        let values = [] as T[];
        observable.subscribe(value => values.push(value));
        return values;
    }
}