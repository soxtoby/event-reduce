declare interface SymbolConstructor {
    readonly observable: symbol;
}

if (!Symbol.observable)
    Object.defineProperty(Symbol, 'observable', {
        value: Symbol('observable'),
        writable: false,
        enumerable: false,
        configurable: false
    });