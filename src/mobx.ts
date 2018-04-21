import { action, observable } from 'mobx';
import { IObservableEvent, combineEventAndObservable } from "./events";
import { state } from "./experimental/state";
import { lastReduction } from "./reduction";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    if (typeof key == 'string')
        state(target, key);
        
    return {
        set(this: any, value: any) {
            let reduction = lastReduction!;
            let box = observable.box(reduction.value, { name: String(key), deep: false });
            reduction.subscribe(value => box.set(value));
            Object.defineProperty(this, key, { get: () => box.get(), enumerable: true });
        }
    };
}

export let events = <T extends { new(...args: any[]): any }>(target: T): T => {
    function EventsClass(...args: any[]) {
        let instance = new target(...args);
        Object.keys(instance).forEach(key => {
            let prop = instance[key];
            if (isObservableEvent(prop))
                instance[key] = combineEventAndObservable(action(key, prop), prop.asObservable());
        });
        return instance;
    }
    EventsClass.prototype = target.prototype;
    return EventsClass as any;
}

function isObservableEvent(o: any): o is IObservableEvent<any, any> {
    return typeof o == 'function' && !!o.subscribe;
}