import { describe, test, expect, beforeEach } from "bun:test";
import { IObservable, merge, Subject } from 'event-reduce';
import { ObservableOperation } from 'event-reduce/lib/observable';
import * as sinon from 'sinon';

describe("ObservableOperation", () => {
    describe("when subscribing", () => {
        let unsubscribe: sinon.SinonSpy;
        let subscribe: sinon.SinonSpy;
        let observer: sinon.SinonSpy;
        let sut: ObservableOperation<any>;
        let result: () => void;

        beforeEach(() => {
            unsubscribe = sinon.spy();
            subscribe = sinon.spy(() => unsubscribe);
            observer = sinon.spy();
            sut = new ObservableOperation(() => 'test', [], subscribe);
            result = sut.subscribe(observer);
        });

        test("subscribe function called with observer", () => {
            expect(subscribe.calledWith(sinon.match({
                getDisplayName: sinon.match.func,
                next: sinon.match.func
            }))).toBe(true);
        });

        describe("when unsubscribed", () => {
            beforeEach(() => {
                result();
            });

            test("unsubscribed from inner subscription", () => expect(unsubscribe.called).toBe(true));
        });
    });

    test("filter", () => {
        let source = observableOf(1, 2, 3, 2, 1);
        let result = source.filter(v => v > 1);
        expect(values(result)).toEqual([2, 3, 2]);
    });

    test("map", () => {
        let source = observableOf(1, 2, 3);
        let result = source.map(v => v * 2);
        expect(values(result)).toEqual([2, 4, 6]);
    });

    test("merge", () => {
        let source1 = new Subject<number>(() => 'source 1');
        let source2 = new Subject<number>(() => 'source 2');
        let result = merge([source1, source2]);
        let vals = [] as number[];
        result.subscribe(v => vals.push(v));

        source1.next(1);
        source2.next(2);
        source1.next(3);

        expect(vals).toEqual([1, 2, 3]);
    });

    function observableOf<T>(...args: T[]) {
        return new ObservableOperation<T>(() => 'source', [], observer => {
            args.forEach(a => observer.next(a));
            return () => { }
        });
    }

    function values<T>(observable: IObservable<T>) {
        let vals = [] as T[];
        observable.subscribe(value => vals.push(value));
        return vals;
    }
});
