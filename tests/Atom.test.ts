import { beforeEach, describe, expect, test } from "bun:test";
import { Atom } from "event-reduce";
import { getUnderlyingSource } from "event-reduce/lib/tracking";
import { MockObserver } from "./MockObserver";

describe("Atom", () => {
    let sut: Atom<string>;
    let observer: MockObserver<string>;

    beforeEach(() => {
        sut = new Atom('sut', 'initial');
        observer = new MockObserver();
        sut.subscribe(observer);
    });

    describe("when value accessed", () => {
        let result: string;

        beforeEach(() => {
            result = sut.value;
        });

        test("returns provided value", () => expect(result).toBe('initial'));

        test("tracks the accessed source", () => expect(getUnderlyingSource(result)).toBe(sut));
    });

    describe("when value changed", () => {
        beforeEach(() => {
            sut.setValue('different');
        });

        test("updates the value", () => expect(sut.value).toBe('different'));

        test("notifies observers", () => expect(observer.sourceUpdated).toHaveBeenCalledWith(sut, 'different'));
    });

    test("when value set to same value, observers are not notified", () => {
        sut.setValue('initial');

        expect(observer.sourceUpdated).not.toHaveBeenCalled();
    });

    test("when custom equality treats values as equal, observers are not notified", () => {
        let custom = new Atom('custom', 'Alpha', (left, right) => left?.toLowerCase() === right?.toLowerCase());
        let customObserver = new MockObserver<string>();
        custom.subscribe(customObserver);

        custom.setValue('alpha');

        expect(custom.value).toBe('Alpha');
        expect(customObserver.sourceUpdated).not.toHaveBeenCalled();
    });
});