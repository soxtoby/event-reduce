import { getState, setState } from "./state";
import { isObject } from "./utils";

let modelDevTools = new Map<object, any>();

export function enableDevTools(model: object, options?: string | IDevToolsOptions) {
    if (process.env.NODE_ENV !== 'production') {
        if (!modelDevTools.has(model) && (window as any).__REDUX_DEVTOOLS_EXTENSION__) {
            let dev = (window as any).__REDUX_DEVTOOLS_EXTENSION__.connect(typeof options == 'string' ? { name: options } : options);
            modelDevTools.set(model, dev);
            dev.init(getState(model));
            let unsubscribe = dev.subscribe((event: any) => {
                if (event.type == 'DISPATCH')
                    setState(model, JSON.parse(event.state));
            });
            return () => {
                modelDevTools.delete(model);
                unsubscribe();
            }
        }
    }
    return () => { };
}

export function sendEvent(name: string, arg: any) {
    if (process.env.NODE_ENV !== 'production') {
        if (modelDevTools.size) {
            let event = isObject(arg)
                ? getState(arg)
                : { value: arg };
            if ('type' in event)
                event['.type'] = event.type;
            event.type = name;
            modelDevTools.forEach((dev, model) => dev.send(event, getState(model, true)));
        }
    }
}

/**
 * redux-devtools-extension options from https://github.com/zalmoxisus/redux-devtools-extension/blob/master/docs/API/Arguments.md
 */
export interface IDevToolsOptions {
    /**
     * The instance name to be shown on the monitor page. Default value is document.title.
     * If not specified and there's no document title, it will consist of tabId and instanceId.
     */
    name?: string;

    /**
     * In ms. If more than one action is dispatched in the indicated interval, all new actions will be collected and sent at once.
     * It is the joint between performance and speed. When set to 0, all actions will be sent instantly. 
     * Set it to a higher value when experiencing perf issues (also maxAge to a lower value). Default is 500 ms.
     */
    latency?: number;

    /**
     * Maximum allowed actions to be stored in the history tree. The oldest actions are removed once maxAge is reached.
     * It's critical for performance. Default is 50.
     */
    maxAge?: number;

    /**
     * If set to true, will include stack trace for every dispatched action, so you can see it in trace tab jumping directly to that part of code.
     * You can use a function (with action object as argument) which should return new Error().stack string, getting the stack outside of reducers.
     * Default to false.
     */
    trace?: boolean | ((action: unknown) => string);

    /**
     * Maximum stack trace frames to be stored (in case trace option was provided as true). By default it's 10.
     * Note that, because extension's calls are excluded, the resulted frames could be 1 less.
     * If trace option is a function, traceLimit will have no effect, as it's supposed to be handled there.
     */
    traceLimit?: number;

    /**
     * undefined - will use regular JSON.stringify to send data (it's the fast mode).
     * false - will handle also circular references.
     * true - will handle also date, regex, undefined, primitives, error objects, symbols, maps, sets and functions.
     */
    serialize?: boolean | {
        /**
         * You can indicate if to include (by setting as true).
         * For function key you can also specify a custom function which handles serialization.
         */
        options: {
            date?: boolean;
            regex?: boolean;
            undefined?: boolean;
            nan?: boolean;
            infinity?: boolean;
            error?: boolean;
            symbol?: boolean;
            map?: boolean;
            set?: boolean;
            function?: boolean | ((fn: Function) => string)
        }

        /**
         * JSON replacer function used for both actions and states stringify.
         * You can specify a data type by adding a __serializedType__ key. So you can deserialize it back while importing or persisting data.
         */
        replacer?: (key: string, value: unknown) => any;

        /**
         * JSON reviver function used for parsing the imported actions and states.
         */
        reviver?: (key: string, value: unknown) => any;

        /**
         * Automatically serialize/deserialize immutablejs via remotedev-serialize. Should be set to the default export of immutablejs.
         */
        immutable?: any;

        /**
         * ImmutableJS Record classes used to make possible restore its instances back when importing, persisting.
         */
        refs?: any[];
    }

    /**
     * Function which takes action object and id number as arguments, and should return action object back.
     */
    actionSanitizer?: (action: unknown, id: number) => any;

    /**
     * Function which takes state object and index as arguments, and should return state object back.
     */
    stateSanitizer?: (state: unknown, index: number) => any;

    /**
     * String or array of strings as regex - actions types to be hidden in the monitors.
     * If actionsWhitelist specified, actionsBlacklist is ignored.
     */
    actionsBlacklist?: string | string[];

    /**
     * String or array of strings as regex - actions types to be shown in the monitors.
     * If actionsWhitelist specified, actionsBlacklist is ignored.
     */
    actionsWhitelist?: string | string[];

    /**
     * Called for every action before sending, takes state and action object, and returns true in case it allows sending the current data to the monitor.
     * Use it as a more advanced version of actionsBlacklist/actionsWhitelist parameters.
     */
    predicate?: (state: unknown, action: unknown) => boolean;

    /**
     * Auto pauses when the extension’s window is not opened, and so has zero impact on your app when not in use. Default is false.
     */
    autoPause?: boolean;
}