import { accessed, Reduction } from "./reduction";
import { mergeSubscriptions, ISubscription, Observable, IObserver, IObservable, ISimpleObservable } from "./observable";
import { Subject } from "./subject";

function derive<T>(getDerivedValue: () => T) {
    return new Derivation(getDerivedValue);
}

class Derivation<T> {
    private _value: any;
    private _observable: ISimpleObservable<void>;

    constructor(private _getDerivedValue: () => T) {
        this._observable = observe(() => { this._value = _getDerivedValue(); });
    }

    get value() {
        return this._value;
    }

    forceUpdate() {
        if (this._subscriptions)
            this._subscriptions.unsubscribe();

        accessed.reductions.length = 0;
        this._value = this._getDerivedValue();
        this._subscriptions = mergeSubscriptions(accessed.reductions.map(d => d.subscribe(() => this.forceUpdate())));
    }
}

function observe(accessValues: () => void) {
    let subject = new Subject();
    let dependencySubscriptions: ISubscription;

    return new Observable<void>(observer => {
        let wasObserved = subject.isObserved;
        let subscription = subject.subscribe(observer);

        if (!wasObserved)
            update();

        return {
            unsubscribe() {
                subscription.unsubscribe();
                if (!subject.isObserved)
                    dependencySubscriptions.unsubscribe();
            }
        }
    });

    function update() {
        if (dependencySubscriptions)
            dependencySubscriptions.unsubscribe();
        accessed.reductions.length = 0;
        accessValues();
        dependencySubscriptions = mergeSubscriptions(accessed.reductions.map(r => r.subscribe(update)));
        subject.next(undefined);
    }
}