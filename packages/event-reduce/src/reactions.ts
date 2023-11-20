import { Action, Unsubscribe } from "./types";

export interface IReactionQueue {
    add(reaction: Action): Unsubscribe;
}

export class MicrotaskQueue implements IReactionQueue {
    add(reaction: Action) {
        let cancelled = false;

        queueMicrotask(function runReaction() {
            if (!cancelled)
                reaction();
        });

        return () => cancelled = true;
    }
}

export const reactionQueue = {
    /** Can be replaced for testing purposes */
    current: new MicrotaskQueue() as IReactionQueue
};