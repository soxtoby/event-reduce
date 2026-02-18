import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { ObservableValue, collectAccessedValues, consumeLastAccessed } from "event-reduce/lib/observableValue";

describe("ObservableValue", () => {
    let sut: ObservableValue<string>;
    let observer: Mock<(value: string) => void>;

    beforeEach(() => {
        sut = new ObservableValue(() => 'sut', 'initial');
        observer = mock();
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

        test("observers notified", () => expect(observer).toHaveBeenCalled());
    });

    test("when value set to same value, observers not notified", () => {
        sut.setValue('initial');

        expect(observer).not.toHaveBeenCalled();
    });
});

describe("collectAccessedValues", () => {
    let valueA: ObservableValue<string>;
    let valueB: ObservableValue<string>;

    beforeEach(() => {
        valueA = new ObservableValue(() => 'a', 'a');
        valueB = new ObservableValue(() => 'b', 'b');
    });

    test("when multiple values accessed, all accessed values returned", () => {
        let result = collectAccessedValues(() => valueA.value + valueB.value);

        expect(Array.from(result)).toContain(valueA);
        expect(Array.from(result)).toContain(valueB);
    });
});