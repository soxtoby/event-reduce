import { sendEvent } from "./devtools";
import { IObservable, Observable } from "./observable";

let loggingEnabled = false;

let logStack = [[]] as LogItem[][];

/**
 * For logged values that have their own specific log formatting.
 * `args` will be passed as separate arguments to `console.log`
 **/
export class LogValue { constructor(public args: unknown[]) { } }

export function enableLogging(enable = true) {
    loggingEnabled = enable;
}

export function logEvent(type: string, displayName: string, arg: any, getInfo: (() => object) | undefined, runEvent: () => void) {
    log(type, displayName, [arg || ''], getInfo, runEvent);
    sendEvent(displayName, arg);
}

export function log<Info extends object>(type: string, displayName: string, args: any[], getInfo?: () => Info, work?: () => void) {
    if (process.env.NODE_ENV !== 'production') {
        if (!loggingEnabled)
            return void work?.();

        if (work) {
            logStack.push([]);

            try {
                work();
            } finally {
                logMessage(logStack.pop()!);
            }
        } else {
            logMessage();
        }

        if (logStack.length == 1) {
            flushLogs(logStack[0]);
            logStack = [[]];
        }

        function logMessage(childLogs: LogItem[] = []) {
            let group = {
                message: [`${displayName} %c${type}`, 'color: grey; font-weight: normal;', ...args],
                children: Object.entries(getInfo?.() ?? {} as Info)
                    .map(([key, value]) => value instanceof LogValue
                        ? [`${key}:`, ...value.args]
                        : [`${key}:`, value])
                    .concat(childLogs)
            };
            logStack.at(-1)!.push(group);
        }

        function flushLogs(logs: LogItem[]) {
            for (let log of logs) {
                if (Array.isArray(log)) {
                    console.log(...log);
                } else if (!log.children.length) {
                    console.log(...log.message);
                } else {
                    console.groupCollapsed(...log.message);
                    flushLogs(log.children);
                    console.groupEnd();
                }
            }
        }
    } else {
        return void work?.();
    }
}

type LogItem = LogMessage | LogGroup;

type LogMessage = any[];

type LogGroup = {
    message: LogMessage;
    children: LogItem[];
}

export interface ISourceInfo {
    readonly name: string;
    readonly sources: readonly ISourceInfo[];
    readonly observable: IObservable<any> | string;
}

export function sourceTree(sources: readonly IObservable<any>[]): ISourceInfo[] {
    if (process.env.NODE_ENV !== 'production')
        return sources.map(s => {
            let source = new WeakRef(s);
            return {
                name: s.displayName,
                sources: (s as Observable<any>).sourceInfo,
                get observable() { return source.deref() ?? "No longer in memory"; }
            }
        });
    else
        return [];
}