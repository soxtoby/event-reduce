import { fireEvent, render } from "@testing-library/react";
import { expect } from "chai";
import { Counter, CounterEvents, CounterModel } from "event-reduce-example/Counter";
import { CounterList, CounterListEvents, CounterListModel } from "event-reduce-example/CounterList";
import { eventProxy, mutable } from "event-reduce/lib/testing";
import * as React from "react";
import { SynchronousPromise } from "synchronous-promise";
import { describe, it, test, then, when } from "wattle";

describe(CounterListModel.name, function () {
    let events = new CounterListEvents();
    let sut = new CounterListModel(events);

    test("there are no counters by default", () => sut.counters.should.be.empty);

    when("counter added", () => {
        events.counterAdded();

        it("has a counter", () => sut.counters.length.should.equal(1));

        let firstCounter = sut.counters[0];

        when("another counter added", () => {
            events.counterAdded();

            it("keeps first counter", () => sut.counters[0].should.equal(firstCounter));

            it("has two counters", () => sut.counters.length.should.equal(2));

            when("second counter removed", () => {
                events.counterRemoved({ id: sut.counters[1].id });

                it("only has first counter left", () => sut.counters.should.have.members([firstCounter]));
            });
        });
    });
});

describe(CounterList.displayName!, function () {
    let model = new CounterListModel(new CounterListEvents());
    let sut = render(<CounterList model={model} />);

    when("'Add Counter' button clicked", () => {
        fireEvent.click(sut.getByText('Add Counter'));

        then("counter added", () => sut.getByTestId('counter').should.exist);

        when("'Remove' button clicked", () => {
            fireEvent.click(sut.getByText('Remove'));

            then("counter removed", () => expect(sut.queryByTestId('counter')).to.not.exist);
        });
    });
});

describe(CounterModel.name, function () {
    let id = 1;
    let initialCount = 3;
    let parentEvents = eventProxy<CounterListEvents>();
    let events = new CounterEvents(parentEvents, id);
    let sut = mutable(new CounterModel(events, { id, count: initialCount }));

    describe("count", () => {
        it("has initial count by default", () => sut.count.should.equal(3));

        when("counter incremented", () => {
            parentEvents.incremented({ id });

            it("is increased by 1", () => sut.count.should.equal(initialCount + 1));
        });

        when("counter decremented", () => {
            parentEvents.decremented({ id });

            it("is decreased by 1", () => sut.count.should.equal(initialCount - 1));
        });

        when("counter reset", () => {
            parentEvents.reset({ id });

            it("becomes 0", () => sut.count.should.equal(0));
        });

        when("value fetched asynchronously", () => {
            let request = SynchronousPromise.unresolved<number>();
            events.valueFetched(request);

            it("remains the same", () => sut.count.should.equal(initialCount));

            when("value returned", () => {
                let answer = 42;
                request.resolve(answer);

                it("becomes the result", () => sut.count.should.equal(answer));
            });
        });
    });

    describe("countTimesTwo", function () {
        it("is two times initial count by default", () => sut.countTimesTwo.should.equal(initialCount * 2));

        when("count updated", () => {
            let newCount = 11;
            sut.count = newCount;

            it("is two times the new count", () => sut.countTimesTwo.should.equal(newCount * 2));
        });
    });
});

describe(Counter.displayName!, function () {
    let id = 1;
    let model = new CounterModel(new CounterEvents(eventProxy(), id), { id, count: 3 });
    let sut = render(<Counter model={model} />);

    it("shows count", () => sut.getByTestId('count').should.have.text('3'));

    it("shows count times two", () => sut.getByTestId('countTimesTwo').should.have.text('6'));

    when("'+' button clicked'", () => {
        fireEvent.click(sut.getByText('+'));

        then("count incremented", () => sut.getByTestId('count').should.have.text('4'));
    });

    when("'-' button clicked", () => {
        fireEvent.click(sut.getByText('-'));

        then("count decremented", () => sut.getByTestId('count').should.have.text('2'));
    });

    when("'0' button clicked'", () => {
        fireEvent.click(sut.getByText('0'));

        then("count reset to 0", () => sut.getByTestId('count').should.have.text('0'));
    });

    when("'Fetch' button clicked", () => {
        fireEvent.click(sut.getByText('Fetch'));

        then("count set to 100", () => sut.getByTestId('count').should.have.text('100'));
    });
});