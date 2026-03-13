import { dispose, emptyArray, nameOfFunction } from "../utils"
import { Effect } from "./effect"
import { startLogging } from "./logging"
import { IObserver, ISource, IValueSource, SourceBase } from "./signals"
import { getState, State } from "./state"
import { beginTransition, iterationSource, trackManagedSourceCreation, trackSourceAccessed } from "./tracking"

export interface IDerivation<T> extends IValueSource<T>, IObserver<any> {
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

export class Derivation<T> extends SourceBase<T> implements IDerivation<T> {
    private _derive: Effect<T>
    private _json?: IDerivation<State<T>>

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

    toJSON() {
        // Lazy init to avoid infinite loop in Derivation constructor
        return (this._json ??= derive(() => getState(this.value), `toJSON(${this.displayName})`)).value
    }

    get sources() { return this._derive.sources }

    override subscribe(observer: IObserver<T>): void {
        if (!this._observers.size)
            this._derive.attach()

        super.subscribe(observer)
    }

    override unsubscribe(observer: IObserver<T>): void {
        super.unsubscribe(observer)

        if (!this._observers.size)
            this._derive.detach()
    }

    sourceUpdated<S>(source: ISource<S>, value: S) { this._derive.sourceUpdated(source, value) }

    override get value() {
        // Notifying tracker before checking for updates so circular reference is detected early
        let access = trackSourceAccessed(this)

        try {
            if (this._derive.isStale)
                this.update()
        } finally {
            access[dispose]()
        }

        return this._value // Not using super.value to avoid duplicate tracker notification
    }

    protected override skipUpdate(nextValue: T) { return this._skipUpdate(this._value, nextValue) }

    update(deriveValue?: () => T, reason?: string) {
        let previousValue = this._value
        let nextValue!: T
        let trigger = this._derive.invalidatingSource ? new WeakRef(this._derive.invalidatingSource) : undefined

        let transition = beginTransition(this, !iterationSource) // Derivations are always safe to access, and only initiate a transition if necessary
        let sourceCreation = trackManagedSourceCreation()
        let logging = startLogging('🔗 (derivation)', this.displayName, emptyArray, () => ({
            Previous: previousValue,
            Current: nextValue,
            // Container: this.container,
            // Sources: sourceTree(this.sources),
            TriggeredBy: trigger
                ? { name: trigger.deref()?.displayName ?? "(unknown)", get observable() { return trigger.deref() ?? "No longer in memory"; } }
                : reason
        }))
        try {
            this.setValue(nextValue = this._derive.run(deriveValue))
            sourceCreation.verifySourceManagement()
        } finally {
            logging[dispose]()
            sourceCreation[dispose]()
            transition[dispose]()
        }
    }

    override[dispose]() {
        this._derive[dispose]()
        this._json?.[dispose]()
        super[dispose]()
    }
}