import { Action, Unsubscribe } from "./types";

export interface IReactionQueue {
    add(reaction: Action): Unsubscribe;
}

export class PromiseQueue implements IReactionQueue {
    constructor(private _resolvedPromise: PromiseLike<void>) { }

    add(reaction: Action) {
        let cancelled = false;

        this._resolvedPromise.then(function runReaction() {
            if (!cancelled)
                reaction();
        });

        return () => cancelled = true;
    }
}

export const reactionQueue = {
    /** Can be replaced for testing purposes */
    current: new PromiseQueue(Promise.resolve())
};