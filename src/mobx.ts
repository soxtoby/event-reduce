import { action, observable } from 'mobx';
import { IObservableEvent, combineEventAndObservable } from "./events";
import { state } from "./experimental/state";
import { IObservable, IObserver, ISubscription, isObserver, mergeSubscriptions } from './observable';
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
                        let wrappedEvent = action(key, (item: any) => prop(wrapAsync(key, item)));
                        this[key] = combineEventAndObservable(wrappedEvent, prop.asObservable());
                    }
                });
            }
        }
    }[className];
}

function wrapAsync(name: string, async: any): any {
    if (isObservable(async)) {
        return Object.assign(Object.create(async), {
            subscribe(nextOrObserver: IObserver<any> | ((value: any) => void), error?: (error: any) => void, complete?: () => void): ISubscription {
                if (isObserver<any>(nextOrObserver)) {
                    let subs = [] as ISubscription[];
                    nextOrObserver && subs.push(async.subscribe(action(name + '.merge', () => nextOrObserver)));
                    subs.push(async.subscribe(nextOrObserver));
                    return mergeSubscriptions(subs);
                } else
                    return async.subscribe(
                        value => isObservable(value)
                            ? wrapAsync(name, value)
                            : action(name + '.merge', nextOrObserver)
                        ,
                        error && action(name + '.errored', error),
                        complete && action(name + '.completed', complete)
                    );
            }
        });
    }

    if (isPromise(async))
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

    return async;
}

function isObservableEvent(e: any): e is IObservableEvent<any, any> {
    return typeof e === 'function' && !!e.subscribe;
}


function isObservable(o: any): o is IObservable<any> {
    return typeof o === 'object' && typeof o.subscribe === 'function';
}

function isPromise(p: any): p is Promise<any> {
    return typeof p === 'object' && typeof p.then === 'function'
}