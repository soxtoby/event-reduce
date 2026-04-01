import { dispose, nullDisposable } from "./utils";

let loggingEnabled = false;

let logStack = [[]] as LogItem[][];

type LogItem = LogMessage | LogGroup;

type LogMessage = any[];

type LogGroup = {
    message: LogMessage;
    children: LogItem[];
}

/**
 * For logged values that have their own specific log formatting.
 * `args` will be passed as separate arguments to `console.log`
 **/
export class LogValue { constructor(public args: unknown[]) { } }

export function enableLogging(enable = true) {
    loggingEnabled = enable;
}

export function startLogging<Info extends object>(type: string, displayName: string, args: readonly any[], getInfo?: () => Info): Disposable {
    if (process.env.NODE_ENV !== 'production' && loggingEnabled) {
        logStack.push([]);
        return { [dispose]() { logMessage(type, displayName, args, getInfo, logStack.pop()!); } }
    } else {
        return nullDisposable
    }
}

export function log<Info extends object>(type: string, displayName: string, args: readonly any[], getInfo?: () => Info) {
    if (process.env.NODE_ENV !== 'production' && loggingEnabled)
        logMessage(type, displayName, args, getInfo);
}

function logMessage<Info extends object>(type: string, displayName: string, args: readonly any[], getInfo?: () => Info, childLogs: LogItem[] = []) {
    try {
        let group = {
            message: [`${displayName} %c${type}`, 'color: grey; font-weight: normal;', ...args],
            children: Object.entries(getInfo?.() ?? {} as Info)
                .map(([key, value]) => value instanceof LogValue
                    ? [`${key}:`, ...value.args]
                    : [`${key}:`, value])
                .concat(childLogs)
        };
        logStack.at(-1)!.push(group);
    } catch (e) {
        logStack.at(-1)!.push([`${displayName} ${type} (logging failed: ${e instanceof Error ? e.message : String(e)})`, ...args]);
    }

    if (logStack.length == 1) {
        flushLogs(logStack[0]);
        logStack = [[]];
    }
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