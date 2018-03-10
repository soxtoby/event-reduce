import { lastReduction } from "./reduction";
import { observable, action } from 'mobx';
import { IObservableAction, makeObservableAction } from "./action";

export let reduced: PropertyDecorator = (target: Object, key: string | symbol): PropertyDescriptor => {
    return {
        set(this: any, value: any) {
            let reduction = lastReduction!;
            let box = observable.shallowBox(reduction.value, String(key));
            reduction.subscribe(value => box.set(value));
            Object.defineProperty(this, key, { get: () => box.get() });
        }
    };
}

export let actions = <T extends { new(...args: any[]): any }>(target: T): T => {
    function ActionsClass(...args: any[]) {
        let instance = new target(...args);
        Object.keys(instance).forEach(key => {
            let prop = instance[key];
            if (isObservableAction(prop))
                instance[key] = makeObservableAction(action(key, prop), prop.asObservable());
        });
        return instance;
    }
    ActionsClass.prototype = target.prototype;
    return ActionsClass as any;
}

function isObservableAction(o: any): o is IObservableAction<any, any> {
    return typeof o == 'function' && !!o.subscribe;
}