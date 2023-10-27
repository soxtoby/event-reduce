import { asyncEvent, derive, derived, event, events, extend, model, reduce, reduced } from "event-reduce";
import { AccessedValueWithCommonSourceError, valueChanged } from "event-reduce/lib/observableValue";
import { describe, it, test, then, when } from "wattle";

describe("models", function () {
    let increment = event('increment');
    let decrement = event('decrement');

    @model
    class TestModel {
        @reduced
        property = reduce(1)
            .on(increment, c => c + 1)
            .value;

        @reduced
        dependentProperty = reduce(1)
            .on(valueChanged(this.property), (_, p) => p)
            .value;

        @derived
        get derivedProperty() {
            return this.property * 2;
        }

        @derived
        derivedField = derive(() => this.property * 2).value;

        @reduced
        basedOnDerivedProperty = reduce(0)
            .on(valueChanged(this.derivedProperty), (_, d) => d)
            .value;
    }
    let testModel = new TestModel();

    @model
    class ExtendedModel extends TestModel {
        override property: number = extend(this.property)
            .on(decrement, c => c - 1)
            .value;
    }
    let extendedModel = new ExtendedModel();

    test("property has initial value", () => testModel.property.should.equal(1));

    test("extended property has same initial value", () => extendedModel.property.should.equal(1));

    when("reduction updated", () => {
        increment();

        then("property value updated", () => testModel.property.should.equal(2));

        then("dependent property value updated", () => testModel.dependentProperty.should.equal(2));

        then("extended property value updated", () => extendedModel.property.should.equal(2));

        then("derived property value updated", () => testModel.derivedProperty.should.equal(4));

        then("derived field value updated", () => testModel.derivedField.should.equal(4));

        then("property based on derived value updated", () => testModel.basedOnDerivedProperty.should.equal(4));
    });

    when("extended reduction updated", () => {
        decrement();

        then("property value unaffected", () => testModel.property.should.equal(1));

        then("extended property value updated", () => extendedModel.property.should.equal(0));
    });

    when("derivation creates a new model that accesses an observable value in its constructor", () => {
        //@model
        class DerivedModel {
            property = testModel.property;
        }
        let derivation = derive(() => new DerivedModel());

        then("accessed observable value is not counted as a source for the derivation", () => derivation.sources.should.be.empty);
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
            property = reduce(testModel.property)
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
        sut.promiseEvent.displayName.should.equal('promiseEvent');
        sut.promiseEvent.started.displayName.should.equal('promiseEvent.started');
        sut.promiseEvent.resolved.displayName.should.equal('promiseEvent.resolved');
        sut.promiseEvent.rejected.displayName.should.equal('promiseEvent.rejected');
    });

    it("sets event container", () => (sut.promiseEvent as any).container.should.equal(sut));
});