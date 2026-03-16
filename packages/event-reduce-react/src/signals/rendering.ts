import { LogValue } from "event-reduce/lib/logging"
import { Effect, log, startLogging } from "event-reduce/lib/signals"
import { ISource } from "event-reduce/lib/signals/signals"
import { beginTransition } from "event-reduce/lib/signals/tracking"
import { constant, dispose, emptyArray, nameOfFunction } from "event-reduce/lib/utils"
import { Children, ReactNode, isValidElement, useState } from "react"
import { useSyncExternalStore } from "use-sync-external-store/shim"

export function Reactive(props: { name?: string; children: () => ReactNode; }): ReactNode {
    return useReactive(props.name || 'Derived', () => props.children())
}

export function reactive<Args extends any[]>(component: (...args: Args) => ReactNode | null) {
    let componentName = nameOfFunction(component) || 'ReactiveComponent'

    const reactiveComponentName = `reactive(${componentName})`
    return {
        [reactiveComponentName]: (...args: Args) => useReactive(componentName, () => component(...args))
    }[reactiveComponentName]
}

export function useReactive<T>(deriveValue: () => T): T
export function useReactive<T>(name: string, deriveValue: () => T): T
export function useReactive<T>(nameOrDeriveValue: string | (() => T), maybeDeriveValue?: () => T): T {
    let [name, deriveValue] = typeof nameOrDeriveValue == 'string'
        ? [nameOrDeriveValue, maybeDeriveValue!]
        : ['ReactiveValue', nameOrDeriveValue]

    let renderEffect = useState(() => new RenderEffect<T>(name))[0]
    useSyncExternalStore(renderEffect.subscribe.bind(renderEffect), () => renderEffect.lastRun)
    return renderEffect.run(deriveValue)
}

class RenderEffect<T> extends Effect<T> {
    private _observers = new Set<() => void>()
    private _trigger: ISource<any> | null = null
    private _previousValue?: T

    constructor(displayName: string) {
        super(displayName, constant(undefined!), (source) => {
            log('⚛️🚩 (render invalidated)', this.displayName, [source])
            this._trigger = source
            for (let subscriber of this._observers)
                subscriber()
        })
    }

    subscribe(observer: () => void) {
        this._observers.add(observer)
        return () => this._observers.delete(observer)
    }

    override run(deriveValue: () => T) {
        let previousValue = this._previousValue
        let nextValue!: T
        let trigger = this._trigger
        this._trigger = null

        let transition = beginTransition(this, true)
        let logging = startLogging('⚛️ (render)', this.displayName, emptyArray, () => ({
            Trigger: trigger?.path ?? 'render',
            Previous: loggedReactValue(previousValue),
            Current: loggedReactValue(nextValue),
        }))

        try {
            nextValue = super.run(deriveValue)
            if (process.env.NODE_ENV !== 'production')
                this._previousValue = nextValue
            return nextValue
        } finally {
            logging[dispose]()
            transition[dispose]()
        }
    }
}

function loggedReactValue(value: unknown) {
    if (process.env.NODE_ENV !== 'production' && isValidElement(value)) {
        let xmlDoc = document.implementation.createDocument(null, null)
        return new LogValue([
            xmlTree(value),
            { ['React element']: value }
        ])

        function xmlTree(node: unknown): Node {
            if (isValidElement(node)) {
                let type = reactElementName(node.type)
                    .split('(').at(-1)!.split(')')[0]  // Unwrap HOC names
                    .replace(/^[0-9-]/, '_$&')  // Escape leading number or dash
                    .replace(/[^a-zA-Z0-9:_.-]/g, '_');  // Escape rest of element name
                let el = xmlDoc.createElement(type || ':unknown:')
                for (let child of Children.toArray((node.props as any).children))
                    el.appendChild(xmlTree(child))
                return el
            }
            return document.createTextNode(String(node))
        }

        function reactElementName(elementType: any) {
            switch (typeof elementType) {
                case 'string':
                    return elementType
                case 'function':
                    return nameOfFunction(elementType)
                case 'symbol':
                    return String(elementType)
                case 'object':
                    if ('_context' in elementType) return 'Context.Provider'
                    if (elementType.displayName) return elementType.displayName
                    if (elementType.type?.displayName) return elementType.type.displayName
            }
        }
    }
    return value
}