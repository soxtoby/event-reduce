import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { derived, event, events, model, reduce, reduced } from "event-reduce";
import { disposeModel } from "event-reduce/lib/cleanup";
import { eventProxy, modelProxy, mutable } from "event-reduce/lib/testing";

describe("mutable", () => {
    @events
    class Events {
        nextValue = event<number>();
    }

    @model
    class Model {
        private privateVal = 'private';

        events = new Events();

        @reduced
        accessor value = reduce(0)
            .on(this.events.nextValue, (_, val) => val)
            .value;

        @derived
        get valuePlusOne() { return this.value + 1; }
    }

    let baseModel: Model;
    let sut: ReturnType<typeof mutable<Model>>;
    let typedModel: Model;

    beforeEach(() => {
        baseModel = new Model();
        baseModel.valuePlusOne;
        sut = mutable(baseModel);
        typedModel = sut.target;
    });

    describe("without overrides", () => {
        test("properties behave normally", () => {
            sut.events.nextValue(3);

            expect(sut.value).toBe(3);
            expect(sut.valuePlusOne).toBe(4);
            expect(sut.valuePlusOne).toBe(4);
        });
    });

    describe("when reduced property overridden", () => {
        beforeEach(() => {
            sut.value = 2;
        });

        test("reduced value returns override", () => expect(sut.value).toBe(2));

        test("computed value is still computed", () => expect(sut.valuePlusOne).toBe(3));
    });

    describe("when computed property overridden", () => {
        beforeEach(() => {
            sut.valuePlusOne = 3;
        });

        test("computed value returns override", () => expect(sut.valuePlusOne).toBe(3));
    });

    test("can be disposed", () => {
        disposeModel(sut);
    });
});

describe("modelProxy", () => {
    class ModelClass {
        constructor(
            public stringValue: string,
            public objectValue: { prop: string }
        ) { }
    }

    let sut: ModelClass;

    beforeEach(() => {
        sut = modelProxy(new ModelClass('foo', { prop: 'bar' }));
    });

    test("can deeply compare proxy", () => {
        expect(sut).toEqual({
            stringValue: 'foo',
            objectValue: {
                prop: 'bar'
            }
        });
    });

    test("can be disposed", () => {
        disposeModel(sut);
    });
});

describe("eventProxy", () => {
    @events
    class Events {
        nextValue = event<number>();
    }

    let untyped: any;
    let typed: Events;

    beforeEach(() => {
        untyped = eventProxy();
        typed = eventProxy<Events>();
    });

    test("arbitrary events work", () => {
        let handler: Mock<(value: string) => void> = mock();
        untyped.foo.subscribe(handler);

        untyped.foo('bar');

        expect(handler).toHaveBeenCalledWith('bar');
    });

    test("custom event creation", () => {
        let custom = eventProxy(() => event<{ value: string }>().scope({ value: 'foo' }));
        let handler: Mock<(value: { value: string }) => void> = mock();
        custom.foo.subscribe(handler);

        custom.foo({});

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: 'foo' }));
    });
});