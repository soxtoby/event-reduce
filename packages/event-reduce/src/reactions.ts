import { Action, Unsubscribe } from "./types";

let currentReactionScope = undefined as Action[] | undefined;

export function batchReactions(action: Action) {
    let outerScope = currentReactionScope;
    let innerScope = currentReactionScope = [] as Action[];

    try {
        action();

        if (innerScope.length) {
            batchReactions(() => {
                let reaction: Action | undefined;
                while (reaction = innerScope.shift()) // Dequeueing in case one reaction cancels a subsequent reaction
                    reaction();
            });
        }
    } finally {
        currentReactionScope = outerScope;
    }
}

export function addReaction(reaction: Action): Unsubscribe {
    if (currentReactionScope) {
        let reactionScope = currentReactionScope;
        reactionScope.push(reaction);
        return () => {
            let i = reactionScope.indexOf(reaction);
            if (i >= 0)
                reactionScope.splice(i, 1);
        };
    }
    else {
        reaction();
        return () => { };
    }
}