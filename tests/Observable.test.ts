import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { IObservable, IObserver, merge, Subject, Unsubscribe } from 'event-reduce';
import { ObservableOperation } from 'event-reduce/lib/observable';

describe("ObservableOperation", () => {
    describe("when subscribing", () => {
        let unsubscribe: Mock<Unsubscribe>;
        let subscribe: Mock<(observer: IObserver<any>) => Unsubscribe>;
        let observer: Mock<(value: any) => void>;
        let sut: ObservableOperation<any>;
        let result: () => void;

        beforeEach(() => {
            unsubscribe = mock();
            subscribe = mock(() => unsubscribe);
            observer = mock();
            sut = new ObservableOperation(() => 'test', [], subscribe);
            result = sut.subscribe(observer);
        });

        test("subscribe function called with observer", () => {
            expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({
                getDisplayName: expect.any(Function),
                next: expect.any(Function)
            }));
        });

        test("when unsubscribed, unsubscribed from inner subscription", () => {
            result();

            expect(unsubscribe).toHaveBeenCalled();
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
