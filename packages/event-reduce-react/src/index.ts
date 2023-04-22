import { cleanupOptions } from "event-reduce/lib/cleanup"

export * from "./hooks";
export * from "./rendering";

let baseSkip = cleanupOptions.skipCleanup;
cleanupOptions.skipCleanup = (value: object) => baseSkip(value) || '$$typeof' in value; // Skip react elements