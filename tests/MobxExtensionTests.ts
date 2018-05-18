import { autorun, spy } from "mobx";
import { SynchronousPromise } from "synchronous-promise";
import { describe, it, test, then, when } from "wattle";
import { events, reduced } from "../src/mobx";
import { reduce } from "../src/reduction";
import { event } from "./../src/events";
import './setup';
import sinon = require("sinon");

describe("reduced decorator", function () {
    let increment = event();
    class TestModel {
        @reduced
        property = reduce(1)
            .on(increment, c => c + 1)
            .value;
    }
    let model = new TestModel();

    let result = [] as number[];
    autorun(() => result.push(model.property));

    test("property has initial value", () => model.property.should.equal(1));

    test("mobx observable provides value", () => result.should.have.members([1]));

    when("reduction updated", () => {
        increment();

        then("property value updated", () => model.property.should.equal(2));

        then("mobx observable updated", () => result.should.have.members([1, 2]));
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
    class TestEvents { someEvent = event<Promise<string>>(); }
    let listener = sinon.stub();
    let unspy = spy(listener);
    let sut = new TestEvents();

    it("keeps class name", () => TestEvents.name.should.equal('TestEvents'));

    test("property is a mobx action", () => {
        sut.someEvent(SynchronousPromise.unresolved());
        listener.should.have.been.calledWith(sinon.match({ type: 'action', name: 'someEvent' }));
    });

    test("extended promises keep extra properties", () => {
        let promise = SynchronousPromise.unresolved<string>();
        (promise as any).foo = 'bar';
        let onstarted = sinon.stub();
        sut.someEvent.subscribe(onstarted);

        sut.someEvent(promise);

        onstarted.should.have.been.calledWith(sinon.match({ foo: 'bar', then: sinon.match.func }));
    });

    test("promise resolved as action", () => {
        let onfulfilled = sinon.stub();
        sut.someEvent.resolved().subscribe(onfulfilled);
        sut.someEvent(SynchronousPromise.resolve('foo'));

        onfulfilled.should.have.been.calledWith('foo');
        listener.should.have.been.calledWith(sinon.match({ type: 'action', name: 'someEvent.resolved' }));
    });

    test("promise rejected as action", () => {
        let onrejected = sinon.stub();
        sut.someEvent.rejected().subscribe(onrejected);
        sut.someEvent(SynchronousPromise.reject<string>('foo'));

        onrejected.should.have.been.calledWith('foo');
        listener.should.have.been.calledWith(sinon.match({ type: 'action', name: 'someEvent.rejected' }));
    });

    unspy();
});