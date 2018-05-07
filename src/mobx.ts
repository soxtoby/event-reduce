import { action, observable } from 'mobx';
import { IObservableEvent, combineEventAndObservable } from "./events";
import { state } from "./experimental/state";
import { last } from "./reduction";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    if (typeof key == 'string')
        state(target, key);
        
    return {
        set(this: any, value: any) {
            let reduction = last.reduction!;
            let box = observable.box(reduction.value, { name: String(key), deep: false });
            reduction.subscribe(value => box.set(value));
            Object.defineProperty(this, key, { get: () => box.get(), enumerable: true });
            last.reduction = undefined; // Stops Reduction from throwing because of accessed value
        }
    };
}

export let events = <T extends { new(...args: any[]): any }>(target: T): T => {
    class EventsClass extends target {
        constructor(...args: any[]) {
            super(...args);
            Object.keys(this).forEach(key => {
                let prop = this[key];
                if (isObservableEvent(prop))
                    this[key] = combineEventAndObservable(action(key, prop), prop.asObservable());
            });
        }
    }
    (EventsClass as any).displayName = (target as any).displayName || target.name
    return EventsClass;
}

function isObservableEvent(o: any): o is IObservableEvent<any, any> {
    return typeof o == 'function' && !!o.subscribe;
}