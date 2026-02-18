import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "bun:test";
import { Counter, CounterEvents, CounterModel } from "event-reduce-example/Counter";
import { CounterList, CounterListEvents, CounterListModel } from "event-reduce-example/CounterList";
import { eventProxy, mutable } from "event-reduce/lib/testing";

describe("CounterListModel", () => {
    let events: CounterListEvents;
    let sut: CounterListModel;

    beforeEach(() => {
        events = new CounterListEvents();
        sut = new CounterListModel(events);
    });

    test("there are no counters by default", () => expect(sut.counters.length).toBe(0));

    describe("when counter added", () => {
        let firstCounter: CounterModel;

        beforeEach(() => {
            events.counterAdded();
            firstCounter = sut.counters[0];
        });

        test("has a counter", () => expect(sut.counters.length).toBe(1));

        describe("when another counter added", () => {
            beforeEach(() => {
                events.counterAdded();
            });

            test("keeps first counter", () => expect(sut.counters[0]).toBe(firstCounter));

            test("has two counters", () => expect(sut.counters.length).toBe(2));

            test("when second counter removed, only has first counter left", () => {
                events.counterRemoved({ id: sut.counters[1].id });

                expect(sut.counters.length).toBe(1);
                expect(sut.counters[0]).toBe(firstCounter);
            });
        });
    });
});

describe("CounterList", () => {
    let model: CounterListModel;
    let sut: ReturnType<typeof render>;

    beforeEach(() => {
        model = new CounterListModel(new CounterListEvents());
        sut = render(<CounterList model={model} />);
    });

    describe("when 'Add Counter' button clicked", () => {
        beforeEach(() => {
            fireEvent.click(sut.getByText('Add Counter'));
        });

        test("counter added", () => expect(sut.getByTestId('counter')).toBeDefined());

        test("when 'Remove' button clicked, counter removed", () => {
            fireEvent.click(sut.getByText('Remove'));

            expect(sut.queryByTestId('counter')).toBeNull();
        });
    });
});

describe("CounterModel", () => {
    let id: number;
    let initialCount: number;
    let parentEvents: any;
    let events: CounterEvents;
    let sut: ReturnType<typeof mutable<CounterModel>>;

    beforeEach(() => {
        id = 1;
        initialCount = 3;
        parentEvents = eventProxy<CounterListEvents>();
        events = new CounterEvents(parentEvents, { id });
        sut = mutable(new CounterModel(events, { id, count: initialCount }));
    });

    describe("count", () => {
        test("has initial count by default", () => expect(sut.count).toBe(3));

        test("when counter incremented, is increased by 1", () => {
            parentEvents.incremented({ id });

            expect(sut.count).toBe(initialCount + 1);
        });

        test("when counter decremented, is decreased by 1", () => {
            parentEvents.decremented({ id });

            expect(sut.count).toBe(initialCount - 1);
        });

        test("when counter reset, becomes 0", () => {
            parentEvents.reset({ id });

            expect(sut.count).toBe(0);
        });

        describe("when value fetched asynchronously", () => {
            let request: Promise<number>;
            let resolve: (value: number) => void;

            beforeEach(() => {
                ({ promise: request, resolve } = Promise.withResolvers<number>());
                events.valueFetched(request);
            });

            test("remains the same", () => expect(sut.count).toBe(initialCount));

            test("when value returned, becomes the result", async () => {
                let answer = 42;
                resolve(answer);
                await request;

                expect(sut.count).toBe(answer);
            });
        });
    });

    describe("countTimesTwo", () => {
        test("is two times initial count by default", () => expect(sut.countTimesTwo).toBe(initialCount * 2));

        test("when count updated, is two times the new count", () => {
            let newCount = 11;
            sut.count = newCount;

            expect(sut.countTimesTwo).toBe(newCount * 2);
        });
    });
});

describe("Counter", () => {
    let id: number;
    let model: CounterModel;
    let sut: ReturnType<typeof render>;

    beforeEach(() => {
        id = 1;
        model = new CounterModel(new CounterEvents(eventProxy(), { id }), { id, count: 3 });
        sut = render(<Counter model={model} />);
    });

    test("shows count", () => expect(sut.getByTestId('count').textContent).toBe('3'));

    test("shows count times two", () => expect(sut.getByTestId('countTimesTwo').textContent).toBe('6'));

    test("when '+' button clicked, count incremented", () => {
        fireEvent.click(sut.getByText('+'));

        expect(sut.getByTestId('count').textContent).toBe('4');
    });

    test("when '-' button clicked, count decremented", () => {
        fireEvent.click(sut.getByText('-'));

        expect(sut.getByTestId('count').textContent).toBe('2');
    });

    test("when '0' button clicked, count reset to 0", () => {
        fireEvent.click(sut.getByText('0'));

        expect(sut.getByTestId('count').textContent).toBe('0');
    });

    test("when 'Fetch' button clicked, count set to 100", async () => {
        fireEvent.click(sut.getByText('Fetch'));

        await waitFor(() => {
            expect(sut.getByTestId('count').textContent).toBe('100');
        });
    });
});