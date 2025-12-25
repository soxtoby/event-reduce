import { describe, test, expect, beforeEach } from "bun:test";
import { asyncEvent, derive, derived, event, events, extend, model, reduce, reduced, state } from "event-reduce";
import { EventsMarkedAsStateError } from "event-reduce/lib/models";
import { AccessedValueWithCommonSourceError, valueChanged } from "event-reduce/lib/observableValue";
import { spy } from "sinon";

describe("legacy models", () => {
    let increment: ReturnType<typeof event<void>>;
    let decrement: ReturnType<typeof event<void>>;

    beforeEach(() => {
        increment = event<void>('increment');
        decrement = event<void>('decrement');
    });

    describe("basic legacy model tests", () => {
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

        let testModel: TestModel;
        let extendedModel: ExtendedModel;

        beforeEach(() => {
            testModel = new TestModel();
            extendedModel = new ExtendedModel();
        });

        test("property has initial value", () => expect(testModel.property).toBe(1));

        test("extended property has same initial value", () => expect(extendedModel.property).toBe(1));

        test("legacy field has initial value", () => expect(testModel.legacyField).toBe(1));

        test("extended legacy field has same initial value", () => expect(extendedModel.legacyField).toBe(1));

        describe("when reduction updated", () => {
            beforeEach(() => {
                increment(undefined);
            });

            test("property value updated", () => expect(testModel.property).toBe(2));

            test("dependent property value updated", () => expect(testModel.dependentProperty).toBe(2));

            test("extended property value updated", () => expect(extendedModel.property).toBe(2));

            test("derived property value updated", () => expect(testModel.derivedProperty).toBe(4));

            test("derived field value updated", () => expect(testModel.derivedField).toBe(4));

            test("property based on derived value updated", () => expect(testModel.basedOnDerivedProperty).toBe(4));

            test("legacy field value updated", () => expect(testModel.legacyField).toBe(2));

            test("extended legacy field value updated", () => expect(extendedModel.legacyField).toBe(2));
        });

        describe("when extended reduction updated", () => {
            beforeEach(() => {
                decrement(undefined);
            });

            test("property value unaffected", () => expect(testModel.property).toBe(1));

            test("extended property value updated", () => expect(extendedModel.property).toBe(0));

            test("legacy field value unaffected", () => expect(testModel.legacyField).toBe(1));

            test("extended legacy field value updated", () => expect(extendedModel.legacyField).toBe(0));
        });

        describe("when derivation creates a new model that accesses an observable value in its constructor", () => {
            test("accessed observable value is not counted as a source for the derivation", () => {
                //@model
                class DerivedModel {
                    property = testModel.property;
                }
                let derivation = derive(() => new DerivedModel());

                expect(derivation.sources.length).toBe(0);
            });
        });

        describe("when reducer creates a new model that observes the same event that created it", () => {
            test("doesn't throw", () => {
                class Parent {
                    @reduced
                    child = reduce(null as TestModel | null)
                        .on(increment, () => new TestModel())
                        .value;
                }

                let parentModel = new Parent();

                increment(undefined);
                expect(parentModel.child).toBeInstanceOf(TestModel);
            });
        });

        describe("when initial value of a model's reduced property is derived from the same event that's creating the model", () => {
            test("throws", () => {
                reduce(null as ChildModel | null)
                    .on(increment, () => new ChildModel());

                class ChildModel {
                    @reduced
                    property = reduce(testModel.property)
                        .on(decrement, c => c - 1)
                        .value;
                }

                expect(() => increment(undefined)).toThrow(AccessedValueWithCommonSourceError);
            });
        });

        describe("when event is marked as state", () => {
            test("throws when constructed", () => {
                @model
                class BadModel {
                    @state
                    event = event('bad state');
                }

                try {
                    new BadModel();
                    expect.unreachable("Should have thrown");
                } catch (e) {
                    expect(e).toBeInstanceOf(EventsMarkedAsStateError);
                    expect((e as EventsMarkedAsStateError).model).toBeDefined();
                    expect((e as EventsMarkedAsStateError).property).toBe('event');
                }
            });
        });
    });
});

describe("events decorator", () => {
    let getterSpy: sinon.SinonSpy;

    @events
    class TestEvents {
        eventField = asyncEvent<string>();

        get eventGetter() {
            getterSpy();
            return asyncEvent<string>();
        }
    }

    let sut: TestEvents;

    beforeEach(() => {
        getterSpy = spy();
        sut = new TestEvents();
    });

    test("keeps class name", () => expect(TestEvents.name).toBe('TestEvents'));

    test("sets event name", () => {
        expect(sut.eventField.displayName).toBe('eventField');
        expect(sut.eventField.started.displayName).toBe('eventField.started');
        expect(sut.eventField.resolved.displayName).toBe('eventField.resolved');
        expect(sut.eventField.rejected.displayName).toBe('eventField.rejected');

        expect(sut.eventGetter.displayName).toBe('eventGetter');
        expect(sut.eventGetter.started.displayName).toBe('eventGetter.started');
        expect(sut.eventGetter.resolved.displayName).toBe('eventGetter.resolved');
        expect(sut.eventGetter.rejected.displayName).toBe('eventGetter.rejected');
    });

    test("sets event container", () => {
        expect((sut.eventField as any).container).toBe(sut);
        expect((sut.eventGetter as any).container).toBe(sut);
    });

    test("snapshots getter event", () => {
        sut.eventGetter;
        sut.eventGetter;

        expect(getterSpy.callCount).toBe(1);
    });

    describe("when event class is marked as state", () => {
        test("throws when constructed", () => {
            @model
            class BadModel {
                @state
                events = new TestEvents();
            }

            try {
                new BadModel();
                expect.unreachable("Should have thrown");
            } catch (e) {
                expect(e).toBeInstanceOf(EventsMarkedAsStateError);
                expect((e as EventsMarkedAsStateError).model).toBeDefined();
                expect((e as EventsMarkedAsStateError).property).toBe('events');
            }
        });
    });
});