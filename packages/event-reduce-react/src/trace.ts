import { unstable_trace } from "scheduler/tracing";

export const trace = unstable_trace
    || function trace<T>(name: string, timestamp: number, callback: () => T, threadID?: number) { return callback(); }