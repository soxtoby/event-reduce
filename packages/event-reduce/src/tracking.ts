import { Effect } from "./effect"
import { disposeGarbage } from "./ownership"
import { type IObserver, type ISource, Source } from "./sources"
import { dispose, nullDisposable } from "./utils"

export let currentIteration = 0
export let iterationSource: ISource<any> | Effect<any> | null = null

let currentAccessTracker: AccessTracker | null = null
let lastSourceAccessed: ISource<any> | null = null

export function beginTransition(source: ISource<any> | Effect<any>, isTriggerEvent: boolean): Disposable {
    if (isTriggerEvent) {
        if (iterationSource)
            throw new SideEffectDuringReactionError(iterationSource, source)

        currentIteration++
        iterationSource = source

        return {
            [dispose]() {
                iterationSource = null
                disposeGarbage()
            }
        }
    } else {
        return nullDisposable
    }
}

export function collectAccessedSources(observer: IObserver<any> | null) {
    return new AccessTracker(observer)
}

export function trackSourceAccessed(source: ISource<any>): Disposable {
    currentAccessTracker?.addAccessed(source)
    return { [dispose]() { lastSourceAccessed = source } }
}

export function getUnderlyingSource<T>(value: T): ISource<T> | null {
    return lastSourceAccessed
        && lastSourceAccessed instanceof Source
        && Object.is(lastSourceAccessed.value, value)
        ? lastSourceAccessed
        : null
}

export interface IAccessTracker extends Disposable {
    readonly accessed: ReadonlySet<ISource<any>>
}

class AccessTracker implements IAccessTracker {
    private readonly _previous: AccessTracker | null
    readonly accessed = new Set<ISource<any>>()

    constructor(private readonly _observer: IObserver<any> | null) {
        this._previous = currentAccessTracker
        currentAccessTracker = this
    }

    addAccessed(source: ISource<any>) {
        if (this._observer) {
            let circularDependency = this.findCircularDependency(source)
            if (circularDependency)
                throw new CircularDependencyError([...circularDependency, source])
        }

        this.accessed.add(source)
    }

    private findCircularDependency(source: ISource<any>): ISource<any>[] | null {
        if (this._observer == source as any as IObserver<any>)
            return [source]
        let circularDependency = this._previous?.findCircularDependency(source)
        return circularDependency
            ? [...circularDependency, this._observer as any as ISource<any>]
            : null
    }

    [dispose]() {
        currentAccessTracker = this._previous
    }
}

export class CircularDependencyError extends Error {
    constructor(path: ISource<any>[]) { super(`Circular dependency detected: ${path.map(s => s.displayName).join(' -> ')}.`) }
}

export class SideEffectDuringReactionError extends Error {
    constructor(
        public reactingTo: ISource<any> | Effect<any>,
        public sideEffect: ISource<any> | Effect<any>
    ) { super(`${sideEffect.displayName} side effect during reaction to ${reactingTo.displayName}.`) }
}
