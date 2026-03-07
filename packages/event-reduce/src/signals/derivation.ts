import { dispose, nameOfFunction } from "../utils"
import { Effect } from "./effect"
import { ISource, SourceObserverBase } from "./signals"
import { sourceWasAccessed, trackManagedSourceCreation } from "./tracking"

export interface IDerivation<T> extends ISource<T> {
    readonly value: T

    /** 
     * Forces the value to be re-calculated. 
     * @param deriveValue Optional function to use to derive the value. If not provided, the original derivation function will be used.
     * @param reason Optional reason for the update. If not invalidated by a source change, this will be used as the reason for the update.
     **/
    update(deriveValue?: () => T, reason?: string): void
}

export function derive<T>(derive: () => T, displayName?: string): IDerivation<T>
export function derive<T>(derive: () => T, valuesEqual: (a: T, b: T) => boolean, displayName?: string): IDerivation<T>
export function derive<T>(derive: () => T, displayNameOrSkip?: string | ((a: T, b: T) => boolean), maybeDisplayName?: string): IDerivation<T> {
    let [skipUpdate, displayName] = typeof displayNameOrSkip == 'function'
        ? [displayNameOrSkip, maybeDisplayName]
        : [Object.is, displayNameOrSkip]
    return new Derivation(displayName ?? nameOfFunction(derive), derive, skipUpdate)
}

export class Derivation<T> extends SourceObserverBase<T, any> {
    private _derive: Effect<T>

    constructor(
        displayName: string,
        derive: () => T,
        private _skipUpdate = Object.is
    ) {
        super(displayName)
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
        sourceWasAccessed(this)

        if (this._derive.sourceLastUpdated > this._derive.lastRun)
            this.update()

        return this._value // Not using super.value to avoid duplicate tracker notification
    }

    protected override skipUpdate(nextValue: T) { return this._skipUpdate(this._value, nextValue) }

    update(deriveValue?: () => T, reason?: string) {
        let sourceCreation = trackManagedSourceCreation()
        try {
            this.setValue(this._derive.run(deriveValue))
            sourceCreation.verifySourceManagement()
        } finally {
            sourceCreation[dispose]()
        }
    }
}