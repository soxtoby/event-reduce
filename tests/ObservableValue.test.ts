import { describe, test, expect, beforeEach } from "bun:test";
import { ObservableValue, collectAccessedValues, consumeLastAccessed } from "event-reduce/lib/observableValue";
import * as sinon from "sinon";

describe(ObservableValue.name, () => {
    let sut: ObservableValue<string>;
    let observer: sinon.SinonStub;

    beforeEach(() => {
        sut = new ObservableValue(() => 'sut', 'initial');
        observer = sinon.stub();
        sut.subscribe(observer);
    });

    describe("when value accessed", () => {
        let result: string;

        beforeEach(() => {
            result = sut.value;
        });

        test("returns provided value", () => expect(result).toBe('initial'));

        test("is last accessed value", () => expect(consumeLastAccessed()!).toBe(sut));
    });

    describe("when value changed", () => {
        beforeEach(() => {
            sut.setValue('different');
        });

        test("value updated", () => expect(sut.value).toBe('different'));

        test("observers notified", () => expect(observer.called).toBe(true));
    });

    describe("when value set to same value", () => {
        beforeEach(() => {
            sut.setValue('initial');
        });

        test("observers not notified", () => expect(observer.called).toBe(false));
    });
});

describe(collectAccessedValues.name, () => {
    let valueA: ObservableValue<string>;
    let valueB: ObservableValue<string>;

    beforeEach(() => {
        valueA = new ObservableValue(() => 'a', 'a');
        valueB = new ObservableValue(() => 'b', 'b');
    });

    describe("when multiple values accessed", () => {
        let result: Set<ObservableValue<any>>;

        beforeEach(() => {
            result = collectAccessedValues(() => valueA.value + valueB.value);
        });

        test("all accessed values returned", () => {
            expect(Array.from(result)).toContain(valueA);
            expect(Array.from(result)).toContain(valueB);
        });
    });
});