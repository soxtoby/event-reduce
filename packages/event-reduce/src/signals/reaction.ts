import { dispose } from "../utils"
import { Effect } from "./effect"
import { reactingTo, startReactingTo } from "./signals"

// NOCOMMIT not sure I have a use for this
export class Reaction extends Effect<void> {
    constructor(
        displayName: string,
        reaction: () => void,
        private _schedule?: (run: () => void) => void
    ) {
        super(displayName, reaction, () => {
            if (this._schedule) {
                let wasReactingTo = reactingTo
                this._schedule(() => {
                    let reaction = wasReactingTo ? startReactingTo(wasReactingTo) : null
                    try {
                        this.run()
                    } finally {
                        reaction?.[dispose]()
                    }
                })
            } else {
                this.run()
            }
        })
    }
}