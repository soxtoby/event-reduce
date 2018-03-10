import { lastReduction } from "./reduction";
import { observable } from 'mobx';

export let reduced: PropertyDecorator = (target: Object, key: string | symbol) => {
    return {
        set(this: any, value: any) {
            let reduction = lastReduction;
            if (!reduction)
                throw new Error(`${key} property must be set to a reduction value`);
            let box = observable.shallowBox(reduction.value, String(key));
            reduction.subscribe(value => box.set(value));
            Object.defineProperty(this, key, { get: () => box.get() });
        }
    } as PropertyDescriptor;
}