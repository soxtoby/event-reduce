let loggingEnabled = false;
let loggingDepth = 0;

export function enableLogging(enable = true) {
    loggingEnabled = enable;
}

export function log(type: string, displayName: string, args: any[], info?: object, work?: () => void) {
    logInner([`${displayName} %c${type}`, 'color: grey; font-weight: normal;', ...args], info, work);
}

function logInner(message: [string, ...any[]], info?: object, work?: () => void) {
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
        let infoKeys = Object.keys(info || {});
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
}