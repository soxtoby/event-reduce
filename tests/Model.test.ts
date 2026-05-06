import { beforeEach, describe, expect, mock, test, type Mock } from "bun:test";
import { asyncEvent, derive, derived, event, events, model, reduce, reduced, state } from "event-reduce";
import { EventsMarkedAsStateError, MissingModelDecoratorError } from "event-reduce/lib/models";
import { decrement, ExtendedModel } from "./Model.test/ExtendedModel";
import { increment, TestModel } from "./Model.test/TestModel";

describe("models", () => {
    describe("basic model tests", () => {
        let testModel: TestModel;
        let extendedModel: ExtendedModel;

        beforeEach(() => {
            testModel = new TestModel();
            extendedModel = new ExtendedModel();
        });

        test("property has initial value", () => expect(testModel.property).toBe(1));

        test("accessor property has initial value", () => expect(testModel.accessorProp).toBe(1));

        test("extended property has same initial value", () => expect(extendedModel.property).toBe(1));

        test("extended accessor property has same initial value", () => expect(extendedModel.accessorProp).toBe(1));

        describe("when reduction updated", () => {
            beforeEach(() => {
                increment();
            });

            test("property value updated", () => expect(testModel.property).toBe(2));

            test("accessor property value updated", () => expect(testModel.accessorProp).toBe(2));

            test("dependent property value updated", () => expect(testModel.dependentProperty).toBe(2));

            test("extended property value updated", () => expect(extendedModel.property).toBe(2));

            test("extended accessor property value updated", () => expect(extendedModel.accessorProp).toBe(2));

            test("derived property value updated", () => expect(testModel.derivedProperty).toBe(4));

            test("property based on derived value updated", () => expect(testModel.basedOnDerivedProperty).toBe(4));
        });

        describe("when extended reduction updated", () => {
            beforeEach(() => {
                decrement();
            });

            test("property value unaffected", () => expect(testModel.property).toBe(1));

            test("accessor property value unaffected", () => expect(testModel.accessorProp).toBe(1));

            test("extended property value updated", () => expect(extendedModel.property).toBe(0));

            test("extended accessor property value updated", () => expect(extendedModel.accessorProp).toBe(0));
        });

        test("when derivation creates a new model that accesses an observable value in its constructor, accessed observable value is not counted as an observable for the derivation", () => {
            @model
            class DerivedModel {
                constructor() {
                    testModel.property;
                }
            }
            let derivation = derive(() => new DerivedModel());
            derivation.update();

            expect([...derivation.getSources()]).toHaveLength(0);
        });

        test("when reducer creates a new model that observes the same event that created it, doesn't throw", () => {
            @model
            class Parent {
                @reduced
                get child() {
                    return reduce(null as TestModel | null)
                        .on(increment, () => new TestModel())
                        .value;
                }
            }

            let parentModel = new Parent();

            increment(undefined);
            expect(parentModel.child).toBeInstanceOf(TestModel);
        });

        test("when event is marked as state, throws when constructed", () => {
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

        test("when class is not decorated with model, @reduced throws when constructed", () => {
            class Bad {
                @reduced
                get x() {
                    return reduce(1).value;
                }
            }

            expect(() => new Bad()).toThrow(MissingModelDecoratorError);
        });

        test("when class is not decorated with model, @derived throws when constructed", () => {
            class Bad {
                @derived
                get x() {
                    return 1;
                }
            }

            expect(() => new Bad()).toThrow(MissingModelDecoratorError);
        });

        test("when class is not decorated with model, @state throws when constructed", () => {
            class Bad {
                @state
                x = 1;
            }

            expect(() => new Bad()).toThrow(MissingModelDecoratorError);
        });

        test("when base class defines toJSON, model decorator does not override it", () => {
            class BaseModel {
                toJSON() {
                    return { serializedValue: "base serializer" };
                }
            }

            @model
            class DerivedModel extends BaseModel {
                @state
                value = 1;
            }

            let sut = new DerivedModel();

            expect(sut.toJSON()).toEqual({ serializedValue: "base serializer" });
            expect(JSON.stringify(sut)).toBe(JSON.stringify({ serializedValue: "base serializer" }));
        });
    });
});

describe("events decorator", () => {
    let getterSpy: Mock<() => void>;

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
        getterSpy = mock();
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

    test("sets event parents", () => {
        expect(sut.eventField.path).toBe('TestEvents.eventField');
        expect(sut.eventGetter.path).toBe('TestEvents.eventGetter');
    });

    test("snapshots getter event", () => {
        sut.eventGetter;
        sut.eventGetter;

        expect(getterSpy).toHaveBeenCalledTimes(1);
    });

    test("when event class is marked as state, throws when constructed", () => {
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
