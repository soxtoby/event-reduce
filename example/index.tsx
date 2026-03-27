import { enableDevTools, enableLogging } from "event-reduce/signals"
import { StrictMode } from "react"
import * as ReactDOM from "react-dom/client"
import { CounterList, CounterListEvents, CounterListModel } from "./CounterList"

enableLogging()

let rootModel = new CounterListModel(new CounterListEvents())

enableDevTools(rootModel, { name: 'Counter List' })

ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <CounterList model={rootModel} />
    </StrictMode>
)
