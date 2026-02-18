import { fireEvent, render } from "@testing-library/react";
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

            describe("when second counter removed", () => {
                beforeEach(() => {
                    events.counterRemoved({ id: sut.counters[1].id });
                });

                test("only has first counter left", () => {
                    expect(sut.counters.length).toBe(1);
                    expect(sut.counters[0]).toBe(firstCounter);
                });
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

        describe("when 'Remove' button clicked", () => {
            beforeEach(() => {
                fireEvent.click(sut.getByText('Remove'));
            });

            test("counter removed", () => expect(sut.queryByTestId('counter')).toBeNull());
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

        describe("when counter incremented", () => {
            beforeEach(() => {
                parentEvents.incremented({ id });
            });

            test("is increased by 1", () => expect(sut.count).toBe(initialCount + 1));
        });

        describe("when counter decremented", () => {
            beforeEach(() => {
                parentEvents.decremented({ id });
            });

            test("is decreased by 1", () => expect(sut.count).toBe(initialCount - 1));
        });

        describe("when counter reset", () => {
            beforeEach(() => {
                parentEvents.reset({ id });
            });

            test("becomes 0", () => expect(sut.count).toBe(0));
        });

        describe("when value fetched asynchronously", () => {
            let request: Promise<number>;
            let resolve: (value: number) => void;

            beforeEach(() => {
                ({ promise: request, resolve } = Promise.withResolvers<number>());
                events.valueFetched(request);
            });

            test("remains the same", () => expect(sut.count).toBe(initialCount));

            describe("when value returned", () => {
                let answer: number;

                beforeEach(async () => {
                    answer = 42;
                    resolve(answer);
                    await request;
                });

                test("becomes the result", () => expect(sut.count).toBe(answer));
            });
        });
    });

    describe("countTimesTwo", () => {
        test("is two times initial count by default", () => expect(sut.countTimesTwo).toBe(initialCount * 2));

        describe("when count updated", () => {
            let newCount: number;

            beforeEach(() => {
                newCount = 11;
                sut.count = newCount;
            });

            test("is two times the new count", () => expect(sut.countTimesTwo).toBe(newCount * 2));
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

    describe("when '+' button clicked", () => {
        beforeEach(() => {
            fireEvent.click(sut.getByText('+'));
        });

        test("count incremented", () => expect(sut.getByTestId('count').textContent).toBe('4'));
    });

    describe("when '-' button clicked", () => {
        beforeEach(() => {
            fireEvent.click(sut.getByText('-'));
        });

        test("count decremented", () => expect(sut.getByTestId('count').textContent).toBe('2'));
    });

    describe("when '0' button clicked", () => {
        beforeEach(() => {
            fireEvent.click(sut.getByText('0'));
        });

        test("count reset to 0", () => expect(sut.getByTestId('count').textContent).toBe('0'));
    });

    describe("when 'Fetch' button clicked", () => {
        beforeEach(() => {
            fireEvent.click(sut.getByText('Fetch'));
        });

        test("count set to 100", () => expect(sut.getByTestId('count').textContent).toBe('100'));
    });
});