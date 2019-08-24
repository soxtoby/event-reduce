import { match, spy } from "sinon";
import { describe, test, then, when } from "wattle";
import { event } from "../src/events";
import { reduce } from "../src/reduction";
import { eventProxy, mutable } from "../src/testing";
import { events, reduced, derived } from "../src/decorators";

describe("mutable", () => {
    @events
    class Events {
        nextValue = event<number>();
    }

    class Model {
        private privateVal = 'private';

        events = new Events();

        @reduced
        value = reduce(0)
            .on(this.events.nextValue, (_, val) => val)
            .value;

        @derived
        get valuePlusOne() { return this.value + 1; }
    }

    let model = new Model();
    model.valuePlusOne;
    let sut = mutable(model);
    let typedModel: Model = sut.readonly;

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

        then("computed value is still computed", () => {
            sut.valuePlusOne.should.equal(3)
        });
    });

    when("computed property overridden", () => {
        sut.valuePlusOne = 3;

        then("computed value returns override", () => sut.valuePlusOne.should.equal(3));
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