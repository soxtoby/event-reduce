import { dispose, nameOfFunction } from "../utils"
import { Effect } from "./effect"
import { ISource, SourceObserverBase, globalTracker } from "./signals"
import { withOwner } from "./tracking"

export interface IDerivation<T> extends ISource<T> {
    readonly value: T
}

export function derive<T>(derive: () => T, displayName?: string): IDerivation<T>
export function derive<T>(derive: () => T, valuesEqual: (a: T, b: T) => boolean, displayName?: string): IDerivation<T>
export function derive<T>(derive: () => T, displayNameOrSkip?: string | ((a: T, b: T) => boolean), maybeDisplayName?: string): IDerivation<T> {
    let [skipUpdate, displayName] = typeof displayNameOrSkip == 'function'
        ? [displayNameOrSkip, maybeDisplayName]
        : [Object.is, displayNameOrSkip]
    return new Derivation(displayName ?? nameOfFunction(derive), derive, skipUpdate)
}

class Derivation<T> extends SourceObserverBase<T, any> {
    private _derive: Effect<T>

    constructor(
        displayName: string,
        derive: () => T,
        skipUpdate = Object.is
    ) {
        super(displayName, skipUpdate)
        this._derive = new Effect(displayName, derive, () => {
            if (this._observers.size)
                this.update()
        })
    }

    get sources() { return this._derive.sources }
    protected override attach() { this._derive.attach() }
    protected override detach() { this._derive.detach() }

    sourceUpdated<S>(source: ISource<S>, value: S) { this._derive.sourceUpdated(source, value) }

    override get value() {
        // Notifying tracker before checking for updates so circular reference is detected early
        globalTracker?.sourceAccessed(this)

        if (this._derive.sourceLastUpdated > this._derive.lastRun)
            this.update()

        return this._value // Not using super.value to avoid duplicate tracker notification
    }

    private update() {
        let ownerScope = withOwner(this)
        try {
            this.setValue(this._derive.run())
        } finally {
            ownerScope[dispose]()
        }
    }
}