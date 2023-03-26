/**
 * From https://github.com/Microsoft/TypeScript/issues/12215#issuecomment-319495340
 * Returns a version of type T where all properties which are also in U are optionalized.
 * Useful for making props with defaults optional in React components.
 * Compare to flow's $Diff<> type: https://flow.org/en/docs/types/utilities/#toc-diff
 */
export type ObjectOmit<T extends object, U extends object> =
    & Omit<T, keyof U & keyof T>
    & { [K in (keyof U & keyof T)]?: T[K]; };
    
export type StringKey<T> = Extract<keyof T, string>;
export type OmitValues<T, Omitted> = FromEntries<Exclude<Entries<T>, [any, Omitted]>>;
export type FromEntries<Entries extends [any, any]> = { [Entry in Entries as Entry[0]]: Entry[1]; };
export type Entries<T> = ValueOf<{ [K in keyof T]: [K, T[K]] }>;
export type ValueOf<T> = T[keyof T];

export type Action = () => void;
export type Unsubscribe = () => void;