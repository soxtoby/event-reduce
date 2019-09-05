import * as React from "react";
import * as ReactDOM from "react-dom";
import { CounterList, CounterListEvents, CounterListModel } from "./CounterList";
import { enableLogging } from "event-reduce";
import { enableDevTools } from "event-reduce/lib/devtools";

enableLogging();

let rootModel = new CounterListModel(new CounterListEvents());

enableDevTools(rootModel, 'Counter List');

ReactDOM.render(<CounterList model={rootModel} />, document.getElementById('root'));