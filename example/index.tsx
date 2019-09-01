import * as React from "react";
import * as ReactDOM from "react-dom";
import { CounterList, CounterListEvents, CounterListModel } from "./CounterList";

let rootModel = new CounterListModel(new CounterListEvents());

ReactDOM.render(<CounterList model={rootModel} />, document.getElementById('root'));