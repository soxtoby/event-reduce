export type Scoped<T extends Scope, Scope extends object> =
    & Omit<T, keyof Scope>
    & { [K in keyof Scope]?: T[K]; };

export type StringKey<T> = Extract<keyof T, string>;
export type OmitValues<T, Omitted> = FromEntries<Exclude<Entries<T>, [any, Omitted]>>;
export type FromEntries<Entries extends [any, any]> = { [Entry in Entries as Entry[0]]: Entry[1]; };
export type Entries<T> = ValueOf<{ [K in keyof T]: [K, T[K]] }>;
export type ValueOf<T> = T[keyof T];

export type Action = () => void;
export type Unsubscribe = () => void;