import * as React from "react";
import * as ReactDOM from "react-dom";
import { CounterList, CounterListEvents, CounterListModel } from "./CounterList";
import { enableLogging } from "event-reduce";

enableLogging();

let rootModel = new CounterListModel(new CounterListEvents());

ReactDOM.render(<CounterList model={rootModel} />, document.getElementById('root'));