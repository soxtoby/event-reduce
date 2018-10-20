/**
 * From https://github.com/Microsoft/TypeScript/issues/12215#issuecomment-307871458
 * The Diff type is a subtraction operator for string literal types. It relies on:
 *  - T | never = T
 *  - T & never = never
 *  - An object with a string index signature can be indexed with any string.
 */
export declare type KeyDiff<T extends string | number | symbol, U extends string | number | symbol> = ({
    [K in T]: K;
} & {
        [K in U]: never;
    } & {
    [K: string]: never;
})[T];
/**
 * From https://github.com/Microsoft/TypeScript/issues/12215#issuecomment-311923766
 * Omits keys in K from object type T
 */
export declare type ObjectOmit<T extends object, K extends keyof T> = Pick<T, KeyDiff<keyof T, K>>;
/**
 * Returns a version of type T where all properties which are also in U are optionalized.
 * Useful for making props with defaults optional in React components.
 * Compare to flow's $Diff<> type: https://flow.org/en/docs/types/utilities/#toc-diff
 */
export declare type ObjectDiff<T extends object, U extends object> = ObjectOmit<T, keyof U & keyof T> & {
    [K in (keyof U & keyof T)]?: T[K];
};

export declare type StringKey<T> = string & keyof T;