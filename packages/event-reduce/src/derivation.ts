import { Effect } from "./effect"
import { startLogging } from "./logging"
import { IObserver, ISource, Source } from "./sources"
import { getState, State } from "./state"
import { beginTransition, iterationSource, trackManagedSourceCreation, trackSourceAccessed } from "./tracking"
import { dispose, emptyArray, nameOfFunction, nullDisposable } from "./utils"

export interface IDerivation<T> extends ISource<T>, IObserver<any> {
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
    return new Derivation((displayName ?? nameOfFunction(derive)) || Derivation.defaultName, derive, skipUpdate)
}

export class Derivation<T> extends Source<T> implements IDerivation<T> {
    private _derive: Effect<T>
    private _json?: Derivation<State<T>>
    static defaultName = "(anonymous derivation)"
    suppressLogging = false

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
        if (!this._json){
            this._json = new Derivation(`toJSON(${this.displayName})`, () => getState(this.value))
            this._json.suppressLogging = true
        }
        return this._json.value
    }

    get sources() { return this._derive.sources }

    override subscribe(observer: IObserver<T>): void {
        if (!this._observers.size)
            this._derive.attach()

        if (this.lastUpdated < 0)
            this.update() // Subscriber may never be notified if we don't collect any sources

        super.subscribe(observer)
    }

    override unsubscribe(observer: IObserver<T>): void {
        super.unsubscribe(observer)

        if (!this._observers.size)
            this.detach()
    }

    detach() { this._derive.detach() }

    override getSources() { return this._derive.getSources() }

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
        let trigger = this._derive.invalidatingSource

        let transition = beginTransition(this, !iterationSource) // Derivations are always safe to access, and only initiate a transition if necessary
        let sourceCreation = trackManagedSourceCreation()
        let logging = this.suppressLogging ? nullDisposable : startLogging('🔗 (derivation)', this.displayName, emptyArray, () => ({
            Path: this.path,
            Trigger: trigger?.path ?? '(unknown)',
            Previous: previousValue,
            Current: nextValue
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