import { Effect } from "./effect"
import { type IObservable, type IObserver, Observable } from "./observable"
import { disposeGarbage } from "./ownership"
import { dispose, nullDisposable } from "./utils"

export let currentIteration = 0
export let iterationSource: IObservable<any> | Effect<any> | null = null
let transitionEffectQueue = [] as (() => void)[]

let currentAccessTracker: AccessTracker | null = null
let lastSourceAccessed: IObservable<any> | null = null

export function beginTransition(source: IObservable<any> | Effect<any>, isTriggerEvent: boolean): Disposable {
    if (isTriggerEvent) {
        if (iterationSource)
            throw new SideEffectDuringReactionError(iterationSource, source)

        currentIteration++
        iterationSource = source

        return {
            [dispose]() {
                let effect: undefined | (() => void)
                while (effect = transitionEffectQueue.shift())
                    effect()
                iterationSource = null
                disposeGarbage()
            }
        }
    } else {
        return nullDisposable
    }
}

export function queueTransitionEffect(effect: () => void) {
    transitionEffectQueue.push(effect)
}

export function collectAccessedSources(observer: IObserver<any> | null) {
    return new AccessTracker(observer)
}

export function startSourceAccessed(source: IObservable<any>) {
    currentAccessTracker?.addAccessed(source)
}

export function endSourceAccessed(source: IObservable<any>) {
    lastSourceAccessed = source
}

export function getUnderlyingObservable<T>(value: T): IObservable<T> | null {
    return lastSourceAccessed
        && lastSourceAccessed instanceof Observable
        && Object.is(lastSourceAccessed.value, value)
        ? lastSourceAccessed
        : null
}

export interface IAccessTracker extends Disposable {
    readonly accessed: ReadonlySet<IObservable<any>>
}

class AccessTracker implements IAccessTracker {
    private readonly _previous: AccessTracker | null
    readonly accessed = new Set<IObservable<any>>()

    constructor(private readonly _observer: IObserver<any> | null) {
        this._previous = currentAccessTracker
        currentAccessTracker = this
    }

    addAccessed(source: IObservable<any>) {
        if (this._observer
            && !this.accessed.has(source)
            && this.hasCircularDependency(source)
        ) {
            throw new CircularDependencyError(this.circularPath(source))
        }

        this.accessed.add(source)
    }

    private hasCircularDependency(source: IObservable<any>) {
        let foundCircularDependency = false
        for (let tracker = this as AccessTracker | null; !foundCircularDependency && tracker; tracker = tracker._previous)
            foundCircularDependency = tracker._observer == source as any as IObserver<any>
        return foundCircularDependency
    }

    private circularPath(source: IObservable<any>) {
        let path = [source]
        let tracker: AccessTracker | null = this
        do {
            path.unshift(tracker._observer as any as IObservable<any>)
            tracker = tracker._previous
        } while (tracker && tracker._observer != source as any as IObserver<any>)
        return path
    }

    [dispose]() {
        currentAccessTracker = this._previous
    }
}

export class CircularDependencyError extends Error {
    constructor(path: IObservable<any>[]) { super(`Circular dependency detected: ${path.map(s => s.displayName).join(' -> ')}.`) }
}

export class SideEffectDuringReactionError extends Error {
    constructor(
        public reactingTo: IObservable<any> | Effect<any>,
        public sideEffect: IObservable<any> | Effect<any>
    ) { super(`${sideEffect.displayName} side effect during reaction to ${reactingTo.displayName}.`) }
}
