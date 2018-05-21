import { action, observable } from 'mobx';
import { IObservableEvent, combineEventAndObservable } from "./events";
import { state } from "./experimental/state";
import { accessed } from "./reduction";
import { ISubscription } from './observable';

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
                        let wrappedEvent = action(key, (item: any) => prop(wrapAsync(key, item)));
                        this[key] = combineEventAndObservable(wrappedEvent, prop.asObservable());
                    }
                });
            }
        }
    }[className];
}

function wrapAsync(name: string, async: any): any {    
    if(isObservableEvent(async)) {
        return Object.assign(Object.create(async), {
            subscribe(next: (value: any) => void, error?: (err: any) => void, complete?: () => void): ISubscription {
                return wrapAsync(name, async.subscribe(
                    next && action(name + '.merge', next),
                    error && action(name + '.errored', error),
                    complete && action(name + '.completed', complete)
                ));
            }
        });
    }

    if (typeof async != 'object' || typeof async.then != 'function')
        return async; // Not a promise

    return Object.assign(Object.create(async), {
        then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
            return wrapAsync(name, async.then(
                onfulfilled && action(name + '.resolved', onfulfilled),
                onrejected && action(name + '.rejected', onrejected)));
        },

        catch(onrejected?: (reason: any) => any): Promise<any> {
            return this.then(undefined, onrejected);
        }
    });
}

function isObservableEvent(o: any): o is IObservableEvent<any, any> {
    return typeof o == 'function' && !!o.subscribe;
}