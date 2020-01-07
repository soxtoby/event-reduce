import { IObservable, merge, Subject } from 'event-reduce';
import { ObservableOperation } from 'event-reduce/lib/observable';
import * as sinon from 'sinon';
import { describe, test, then, when } from 'wattle';

describe("ObservableOperation", function () {
    when("subscribing", () => {
        let unsubscribe = sinon.spy();
        let subscribe = sinon.spy(() => unsubscribe);
        let observer = sinon.spy();

        let sut = new ObservableOperation(() => 'test', [], subscribe);
        let result = sut.subscribe(observer);

        then("subscribe function called with observer", () => subscribe.should.have.been.calledWith(sinon.match({
            getDisplayName: sinon.match.func,
            next: sinon.match.func
        })));

        when("unsubscribed", () => {
            result();

            then("unsubscrived from inner subscription", () => unsubscribe.should.have.been.called);
        })
    });

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

    test("merge", () => {
        let source1 = new Subject<number>(() => 'source 1');
        let source2 = new Subject<number>(() => 'source 2');
        let result = merge([source1, source2]);
        let values = [] as number[];
        result.subscribe(v => values.push(v));

        source1.next(1);
        source2.next(2);
        source1.next(3);

        values.should.have.members([1, 2, 3]);
    });

    function observableOf<T>(...args: T[]) {
        return new ObservableOperation<T>(() => 'source', [], observer => {
            args.forEach(a => observer.next(a));
            return () => { }
        });
    }

    function values<T>(observable: IObservable<T>) {
        let values = [] as T[];
        observable.subscribe(value => values.push(value));
        return values;
    }
});
