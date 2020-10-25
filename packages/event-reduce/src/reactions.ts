import { Action, Unsubscribe } from "./types";

let pendingReactions = [] as Action[];

export function addReaction(reaction: Action): Unsubscribe {
    pendingReactions.push(reaction);

    if (pendingReactions.length == 1)
        Promise.resolve().then(runReactions); // Run reactions asyncronously

    return () => {
        let i = pendingReactions.indexOf(reaction);
        if (i >= 0)
            pendingReactions.splice(i, 1);
    };
}

/** 
 * Run pending reactions.
 * Will normally be run automatically, asynchronously, but it can be useful to run early in some situations;
 * e.g. in tests where you want to avoid asynchronous behaviour.
 */
export function runReactions() {
    let reaction: Action | undefined;
    while (reaction = pendingReactions.shift()) { // Dequeueing in case a reaction changes subsequent reactions
        try {
            reaction();
        } catch (error) {
            console.error(error);
        }
    }
}