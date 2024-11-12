import { derived, event, events, model, reduce, reduced } from "event-reduce";
import { disposeModel } from "event-reduce/lib/cleanup";
import { eventProxy, modelProxy, mutable } from "event-reduce/lib/testing";
import { match, spy } from "sinon";
import { describe, test, then, when } from "wattle";

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

    let baseModel = new Model();
    baseModel.valuePlusOne;
    let sut = mutable(baseModel);
    let typedModel: Model = sut.target;

    when("without overrides", () => {
        then("properties behave normally", () => {
            sut.events.nextValue(3);

            sut.value.should.equal(3);
            sut.valuePlusOne.should.equal(4);
            sut.valuePlusOne.should.equal(4);
        });
    });

    when("reduced property overridden", () => {
        sut.value = 2;

        then("reduced value returns override", () => sut.value.should.equal(2));

        then("computed value is still computed", () => sut.valuePlusOne.should.equal(3));
    });

    when("computed property overridden", () => {
        sut.valuePlusOne = 3;

        then("computed value returns override", () => sut.valuePlusOne.should.equal(3));
    });

    test("can be disposed", () => {
        disposeModel(sut);
    });
});

describe(modelProxy.name, function () {
    class ModelClass {
        constructor(
            public stringValue: string,
            public objectValue: { prop: string }
        ) { }
    }

    let sut = modelProxy(new ModelClass('foo', { prop: 'bar' }));

    test("can deeply compare proxy", () => sut.should.deep.equal({
        stringValue: 'foo',
        objectValue: {
            prop: 'bar'
        }
    }));

    test("can be disposed", () => {
        disposeModel(sut);
    });
});

describe("eventProxy", () => {
    @events
    class Events {
        nextValue = event<number>();
    }

    let untyped = eventProxy();
    let typed: Events = eventProxy<Events>();

    test("arbitrary events work", () => {
        let handler = spy();
        untyped.foo.subscribe(handler);

        untyped.foo('bar');

        handler.should.have.been.calledWith('bar');
    });

    test("custom event creation", () => {
        let custom = eventProxy(() => event<{ value: string }>().scope({ value: 'foo' }));
        let handler = spy();
        custom.foo.subscribe(handler);

        custom.foo({});

        handler.should.have.been.calledWith(match({ value: 'foo' }));
    })
});