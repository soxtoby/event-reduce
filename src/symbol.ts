// Custom implementation due to https://github.com/ReactiveX/rxjs/issues/3697
declare global {
    export interface SymbolConstructor {
        observable: symbol;
    }
}

export interface Symbol {
    [Symbol.observable]: symbol;
}

export const observable = Symbol.observable || '@@observable';
