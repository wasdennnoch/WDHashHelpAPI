// https://stackoverflow.com/questions/40510611/typescript-interface-require-one-of-two-properties-to-exist
export type RequireAtLeastOne<T, Keys extends keyof T> = Omit<T, Keys> & {
    [K in Keys]-?: Required<NonNullable<Pick<T, K>>> & Partial<Pick<T, Exclude<Keys, K>>>;
}[Keys];

export type RequireOnlyOne<T, Keys extends keyof T> = Omit<T, Keys> & {
    [K in Keys]-?: Required<NonNullable<Pick<T, K>>> & Partial<Record<Exclude<Keys, K>, undefined>>;
}[Keys];
