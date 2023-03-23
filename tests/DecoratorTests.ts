import { asyncEvent, derived, event, events, extend, reduce, reduced, derive } from "event-reduce";
import { AccessedValueWithCommonSourceError } from "event-reduce/lib/observableValue";
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

        @derived
        get derivedProperty() {
            return this.property * 2;
        }

        @derived
        derivedField = derive(() => this.property * 2).value;

        @reduced
        basedOnDerivedProperty = reduce(0)
            .onValueChanged(this.derivedProperty, (_, d) => d)
            .value;
    }
    let model = new TestModel();

    class ExtendedModel extends TestModel {
        property: number = extend(this.property)
            .on(decrement, c => c - 1)
            .value;
    }
    let extendedModel = new ExtendedModel();

    test("property has initial value", () => model.property.should.equal(1));

    test("extended property has same initial value", () => extendedModel.property.should.equal(1));

    when("reduction updated", () => {
        increment();

        then("property value updated", () => model.property.should.equal(2));

        then("dependent property value updated", () => model.dependentProperty.should.equal(2));

        then("extended property value updated", () => extendedModel.property.should.equal(2));

        then("derived property value updated", () => model.derivedProperty.should.equal(4));

        then("derived field value updated", () => model.derivedField.should.equal(4));

        then("property based on derived value updated", () => model.basedOnDerivedProperty.should.equal(4));
    });

    when("extended reduction updated", () => {
        decrement();

        then("property value unaffected", () => model.property.should.equal(1));

        then("extended property value updated", () => extendedModel.property.should.equal(0));
    });

    when("reducer creates a new model that observes the same event that created it", () => {
        class Parent {
            @reduced
            child = reduce(null as TestModel | null)
                .on(increment, () => new TestModel())
                .value;
        }

        let parentModel = new Parent();

        it("doesn't throw", () => {
            increment();
            parentModel.child!.should.be.an.instanceof(TestModel);
        })
    });

    when("initial value of a model's reduced property is derived from the same event that's creating the model", () => {
        reduce(null as ChildModel | null)
            .on(increment, () => new ChildModel());

        class ChildModel {
            @reduced
            property = reduce(model.property)
                .on(decrement, c => c - 1)
                .value;
        }

        it("throws", () => increment.should.throw(AccessedValueWithCommonSourceError));
    });
});

describe("events decorator", function () {
    @events
    class TestEvents {
        promiseEvent = asyncEvent<string>();
    }
    let sut = new TestEvents();

    it("keeps class name", () => TestEvents.name.should.equal('TestEvents'));

    it("sets event name", () => {
        (sut.promiseEvent as any).displayName.should.equal('promiseEvent');
        sut.promiseEvent.started.displayName.should.equal('promiseEvent.started');
        sut.promiseEvent.resolved.displayName.should.equal('promiseEvent.resolved');
        sut.promiseEvent.rejected.displayName.should.equal('promiseEvent.rejected');
    });

    it("sets event container", () => (sut.promiseEvent as any).container.should.equal(sut));
});