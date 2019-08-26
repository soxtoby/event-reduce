/**
 * From https://github.com/Microsoft/TypeScript/issues/12215#issuecomment-319495340
 * Returns a version of type T where all properties which are also in U are optionalized.
 * Useful for making props with defaults optional in React components.
 * Compare to flow's $Diff<> type: https://flow.org/en/docs/types/utilities/#toc-diff
 */
export declare type ObjectOmit<T extends object, U extends object> = Omit<T, keyof U & keyof T> & {
    [K in (keyof U & keyof T)]?: T[K];
};

export declare type StringKey<T> = string & keyof T;