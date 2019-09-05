import { sendEvent } from "./devtools";
import { IObservable } from "./observable";

let loggingEnabled = false;
let loggingDepth = 0;

export function enableLogging(enable = true) {
    loggingEnabled = enable;
}

export function logEvent(type: string, displayName: string, arg: any, getInfo: (() => object) | undefined, runEvent: () => void) {
    log(type, displayName, [arg || ''], getInfo, runEvent);
    sendEvent(displayName, arg);
}

export function log(type: string, displayName: string, args: any[], getInfo?: () => object, work?: () => void) {
    if (process.env.NODE_ENV === 'development') {
        if (!loggingEnabled)
            return void (work && work());

        if (work) {
            logMessage(true);
            loggingDepth++;

            try {
                work();
            } finally {
                console.groupEnd();
                loggingDepth--;
            }
        } else {
            logMessage(false);
        }

        function logMessage(group: boolean) {
            let message = [`${displayName} %c${type}`, 'color: grey; font-weight: normal;', ...args];

            let info = getInfo && getInfo() || {};
            let infoKeys = Object.keys(info);
            if (infoKeys || group) {
                if (loggingDepth)
                    console.group(...message);
                else
                    console.groupCollapsed(...message);

                for (let key of infoKeys)
                    console.log(`${key}:`, (info as any)[key]);

                if (!group)
                    console.groupEnd();
            } else {
                console.log(...message);
            }
        }
    } else {
        return void (work && work());
    }
}

export interface ISourceInfo {
    sources: ISourceInfo[];
}

export function sourceTree(sources: readonly IObservable<any>[]): ISourceInfo[] {
    if (process.env.NODE_ENV === 'development')
        return sources.map(s => ({ name: s.displayName, sources: sourceTree(s.sources), get observable() { return s; } }));
    else
        return [];
}