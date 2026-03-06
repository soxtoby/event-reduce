import { dispose } from "../utils"
import { Effect } from "./effect"
import { beginTransition, iterationSource } from "./tracking"

// NOCOMMIT not sure I have a use for this
export class Reaction extends Effect<void> {
    constructor(
        displayName: string,
        reaction: () => void,
        private _schedule?: (run: () => void) => void
    ) {
        super(displayName, reaction, () => {
            if (this._schedule) {
                let reactionSource = iterationSource
                this._schedule(() => {
                    let transition = reactionSource ? beginTransition(reactionSource) : null
                    try {
                        this.run()
                    } finally {
                        transition?.[dispose]()
                    }
                })
            } else {
                this.run()
            }
        })
    }
}