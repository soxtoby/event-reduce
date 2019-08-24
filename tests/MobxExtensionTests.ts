import { SynchronousPromise } from "synchronous-promise";
import { describe, it, test, then, when } from "wattle";
import { events, reduced, extend, derived } from "../src/decorators";
import { watch } from "../src/watching";
import { Observable } from "../src/observable";
import { reduce } from "../src/reduction";
import { event, asyncEvent } from "./../src/events";
import './setup';
import sinon = require("sinon");

describe("reduced decorator", function () {
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

    let result = [] as number[];
    watch(() => result.push(model.property));

    test("property has initial value", () => model.property.should.equal(1));

    test("extended property has same initial value", () => model.extendedProperty.should.equal(1));

    test("mobx observable provides value", () => result.should.have.members([1]));

    when("reduction updated", () => {
        increment();

        then("property value updated", () => model.property.should.equal(2));

        then("mobx observable updated", () => result.should.have.members([1, 2]));

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
        observableEvent = event<Observable<string>>();
    }
    let listener = sinon.stub();
    let sut = new TestEvents();

    it("keeps class name", () => TestEvents.name.should.equal('TestEvents'));

    test("property is a mobx action", () => {
        sut.promiseEvent(SynchronousPromise.unresolved());
        listener.should.have.been.calledWith(sinon.match({ type: 'action', name: 'promiseEvent' }));
    });

    test("extended promises keep extra properties", () => {
        let promise = SynchronousPromise.unresolved<string>();
        (promise as any).foo = 'bar';
        let onstarted = sinon.stub();
        sut.promiseEvent.started.subscribe(onstarted);

        sut.promiseEvent(promise);

        onstarted.should.have.been.calledWith(sinon.match({ foo: 'bar', then: sinon.match.func }));
    });

    test("promise resolved as action", () => {
        let onfulfilled = sinon.stub();
        sut.promiseEvent.resolved.subscribe(onfulfilled);
        sut.promiseEvent(SynchronousPromise.resolve('foo'));

        onfulfilled.should.have.been.calledWith('foo');
        listener.should.have.been.calledWith(sinon.match({ type: 'action', name: 'promiseEvent.resolved' }));
    });

    test("promise rejected as action", () => {
        let onrejected = sinon.stub();
        sut.promiseEvent.rejected.subscribe(onrejected);
        sut.promiseEvent(SynchronousPromise.reject<string>('foo'));

        onrejected.should.have.been.calledWith('foo');
        listener.should.have.been.calledWith(sinon.match({ type: 'action', name: 'promiseEvent.rejected' }));
    });
});