import { ObjectDiff } from "./types";
import { IObservable, Subject } from './observable';
import { reduce } from './reduction';

export interface IActionMethods<TIn, TOut> {
    scope<TIn extends object, TOut extends TIn, TScope extends Partial<TIn>>(scope: TScope): IObservableAction<ObjectDiff<TIn, TScope>, TOut>;
}

export type Action<T = any> = (item: T) => void;
export type IObservableAction<TIn, TOut> = Action<TIn> & IActionMethods<TIn, TOut> & IObservable<TOut>;

export function action<T>(): IObservableAction<T, T> {
    let subject = new Subject<T>();
    return makeObservableAction((value: T) => subject.next(value), subject.asObservable());
}

function scope<TIn extends object, TOut extends TIn, TScope extends Partial<TIn>>(this: IObservableAction<TIn, TOut>, scope: TScope): IObservableAction<ObjectDiff<TIn, TScope>, TOut> {
    let scopedAction = (value: ObjectDiff<TIn, TScope>) => this(Object.assign(value, scope) as any as TIn);
    let scopedObservable = this
        .filter(value => Object.keys(scope).every(p => value[p as keyof TIn] == scope[p as keyof TIn]));
    return makeObservableAction(scopedAction, scopedObservable);
}

function makeObservableAction<TIn, TOut>(action: Action<TIn>, observable: IObservable<TOut>): IObservableAction<TIn, TOut> {
    return Object.assign(action, observable, { scope });
}