import { reduce } from "./reduction";
import { Subject } from "./observable";

class Actions {
    increment = new Subject<void>();
    decrement = new Subject<void>();
    reset = new Subject<void>();
    fetchValue = new Subject<Promise<number>>();
}

class Model {
    constructor(public actions: Actions) { }

    count = reduce(0)
        .on(this.actions.increment, (current) => current + 1)
        .on(this.actions.decrement, (current) => current - 1)
        .on(this.actions.reset, () => 0)
        .value;
}

let model = new Model(new Actions());