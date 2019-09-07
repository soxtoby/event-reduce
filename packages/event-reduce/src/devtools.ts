import { getState, setState } from "./state";

let modelDevTools = new Map<object, any>();

export function enableDevTools(model: object, name?: string) {
    if (process.env.NODE_ENV === 'development') {
        if (!modelDevTools.has(model) && (window as any).__REDUX_DEVTOOLS_EXTENSION__) {
            let dev = (window as any).__REDUX_DEVTOOLS_EXTENSION__.connect({ name });
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
    if (process.env.NODE_ENV === 'development') {
        if (modelDevTools.size) {
            let event = typeof arg == 'object'
                ? { ...arg }
                : { value: arg };
            if ('type' in event)
                event['.type'] = event.type;
            event.type = name;
            modelDevTools.forEach((dev, model) => dev.send(event, getState(model)));
        }
    }
}