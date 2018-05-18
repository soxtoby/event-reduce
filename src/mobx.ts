import { action, observable } from 'mobx';
import { IObservableEvent, combineEventAndObservable } from "./events";
import { state } from "./experimental/state";
import { accessed } from "./reduction";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    if (typeof key == 'string')
        state(target, key);

    return {
        set(this: any, value: any) {
            let reduction = accessed.reductions.pop()!;
            let box = observable.box(reduction.value, { name: String(key), deep: false });
            reduction.subscribe(value => box.set(value));
            Object.defineProperty(this, key, { get: () => box.get(), enumerable: true });
        }
    };
}

export let events = <T extends { new(...args: any[]): any }>(target: T): T => {
    const className = (target as any).displayName || target.name;
    return {
        [className]: class extends target {
            constructor(...args: any[]) {
                super(...args);
                Object.keys(this).forEach(key => {
                    let prop = this[key];
                    if (isObservableEvent(prop)) {
                        let wrappedEvent = action(key, (item: any) => prop(wrapPromise(key, item)));
                        this[key] = combineEventAndObservable(wrappedEvent, prop.asObservable());
                    }
                });
            }
        }
    }[className];
}

function isObservableEvent(o: any): o is IObservableEvent<any, any> {
    return typeof o == 'function' && !!o.subscribe;
}

function wrapPromise(name: string, promise: any): any {
    if (typeof promise != 'object' || typeof promise.then != 'function')
        return promise; // Not a promise

    return Object.assign(Object.create(promise), {
        then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
            return wrapPromise(name, promise.then(
                onfulfilled && action(name + '.resolved', onfulfilled),
                onrejected && action(name + '.rejected', onrejected)));
        },

        catch(onrejected?: (reason: any) => any): Promise<any> {
            return this.then(undefined, onrejected);
        }
    });
}