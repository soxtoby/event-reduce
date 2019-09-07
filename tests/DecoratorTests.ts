import { asyncEvent, derived, event, events, extend, reduce, reduced } from "event-reduce";
import { describe, it, test, then, when } from "wattle";

describe("model decorators", function () {
    let increment = event();
    let decrement = event();
    class TestModel {
        @reduced
        property = reduce(1)
            .on(increment, c => c + 1)
            .value;

        @reduced
        dependentProperty = reduce(1)
            .onValueChanged(this.property, (_, p) => p)
            .value;

        @reduced
        extendedProperty = extend(this.property)
            .on(decrement, c => c - 1)
            .value;

        @derived
        get derivedProperty() {
            return this.property * 2;
        }

        @reduced
        basedOnDerivedProperty = reduce(0)
            .onValueChanged(this.derivedProperty, (_, d) => d)
            .value;
    }
    let model = new TestModel();

    test("property has initial value", () => model.property.should.equal(1));

    test("extended property has same initial value", () => model.extendedProperty.should.equal(1));

    when("reduction updated", () => {
        increment();

        then("property value updated", () => model.property.should.equal(2));

        then("dependent property value updated", () => model.dependentProperty.should.equal(2));

        then("extended property value updated", () => model.extendedProperty.should.equal(2));

        then("derived property value updated", () => model.derivedProperty.should.equal(4));

        then("property based on derived value updated", () => model.basedOnDerivedProperty.should.equal(4));
    });

    when("extended reduction updated", () => {
        decrement();

        then("property value unaffected", () => model.property.should.equal(1));

        then("extended property value updated", () => model.extendedProperty.should.equal(0));
    });

    when("reducer creates a new model", () => {
        let createChild = event()
        class Parent {
            @reduced
            child = reduce(null as TestModel | null)
                .on(createChild, () => new TestModel())
                .value;
        }

        let parentModel = new Parent();

        it("doesn't throw", () => {
            createChild();
            parentModel.child!.should.be.an.instanceof(TestModel);
        })
    });
});

describe("events decorator", function () {
    @events
    class TestEvents {
        promiseEvent = asyncEvent<string>();
    }
    let sut = new TestEvents();

    it("keeps class name", () => TestEvents.name.should.equal('TestEvents'));

    it("sets event name", () => (sut.promiseEvent as any).displayName.should.equal('promiseEvent'));

    it("sets event container", () => (sut.promiseEvent as any).container.should.equal(sut));
});