import { asyncEvent, derive, derived, event, events, extend, model, reduce, reduced, state } from "event-reduce";
import { EventsMarkedAsStateError } from "event-reduce/lib/models";
import { AccessedValueWithCommonSourceError, valueChanged } from "event-reduce/lib/observableValue";
import { spy } from "sinon";
import { describe, it, test, then, when } from "wattle";

describe("models", function () {
    let increment = event('increment');
    let decrement = event('decrement');

    @model
    class TestModel {
        @reduced
        legacyField = reduce(1)
            .on(increment, c => c + 1)
            .value;

        @reduced
        get property() {
            return reduce(1)
                .on(increment, c => c + 1)
                .value;
        }

        @reduced
        get dependentProperty() {
            return reduce(1)
                .on(valueChanged(this.property), (_, p) => p)
                .value;
        }

        @derived
        get derivedProperty() {
            return this.property * 2;
        }

        @derived
        derivedField = derive(() => this.legacyField * 2).value;

        @reduced
        get basedOnDerivedProperty() {
            return reduce(0)
                .on(valueChanged(this.derivedProperty), (_, d) => d)
                .value;
        }
    }
    let testModel = new TestModel();

    @model
    class ExtendedModel extends TestModel {
        override legacyField: number = extend(this.property)
            .on(decrement, c => c - 1)
            .value;

        @reduced
        override get property() {
            return extend(super.property)
                .on(decrement, c => c - 1)
                .value;
        }
    }
    let extendedModel = new ExtendedModel();

    test("property has initial value", () => testModel.property.should.equal(1));

    test("extended property has same initial value", () => extendedModel.property.should.equal(1));

    test("legacy field has initial value", () => testModel.legacyField.should.equal(1));

    test("extended legacy field has same initial value", () => extendedModel.legacyField.should.equal(1));

    when("reduction updated", () => {
        increment();

        then("property value updated", () => testModel.property.should.equal(2));

        then("dependent property value updated", () => testModel.dependentProperty.should.equal(2));

        then("extended property value updated", () => extendedModel.property.should.equal(2));

        then("derived property value updated", () => testModel.derivedProperty.should.equal(4));

        then("derived field value updated", () => testModel.derivedField.should.equal(4));

        then("property based on derived value updated", () => testModel.basedOnDerivedProperty.should.equal(4));

        then("legacy field value updated", () => testModel.legacyField.should.equal(2));

        then("extended legacy field value updated", () => extendedModel.legacyField.should.equal(2));
    });

    when("extended reduction updated", () => {
        decrement();

        then("property value unaffected", () => testModel.property.should.equal(1));

        then("extended property value updated", () => extendedModel.property.should.equal(0));

        then("legacy field value unaffected", () => testModel.legacyField.should.equal(1));

        then("extended legacy field value updated", () => extendedModel.legacyField.should.equal(0));
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

    when("event is marked as state", () => {
        @model
        class BadModel {
            @state
            event = event('bad state');
        }

        it("throws when constructed", () => {
            let err = (() => new BadModel()).should.throw(EventsMarkedAsStateError);
            err.has.property('model');
            err.has.property('property', 'event');
        });
    });
});

describe("events decorator", function () {
    let getterSpy = spy();

    @events
    class TestEvents {
        eventField = asyncEvent<string>();

        get eventGetter() {
            getterSpy();
            return asyncEvent<string>();
        }
    }
    let sut = new TestEvents();

    it("keeps class name", () => TestEvents.name.should.equal('TestEvents'));

    it("sets event name", () => {
        sut.eventField.displayName.should.equal('eventField');
        sut.eventField.started.displayName.should.equal('eventField.started');
        sut.eventField.resolved.displayName.should.equal('eventField.resolved');
        sut.eventField.rejected.displayName.should.equal('eventField.rejected');

        sut.eventGetter.displayName.should.equal('eventGetter');
        sut.eventGetter.started.displayName.should.equal('eventGetter.started');
        sut.eventGetter.resolved.displayName.should.equal('eventGetter.resolved');
        sut.eventGetter.rejected.displayName.should.equal('eventGetter.rejected');
    });

    it("sets event container", () => {
        (sut.eventField as any).container.should.equal(sut);
        (sut.eventGetter as any).container.should.equal(sut);
    });

    it("snapshots getter event", () => {
        sut.eventGetter;
        sut.eventGetter;

        getterSpy.should.have.been.calledOnce;
    });

    when("event class is marked as state", () => {
        @model
        class BadModel {
            @state
            events = new TestEvents();
        }

        it("throws when constructed", () => {
            let err = (() => new BadModel()).should.throw(EventsMarkedAsStateError);
            err.has.property('model');
            err.has.property('property', 'events');
        });
    })
});