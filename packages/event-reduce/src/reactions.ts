let reactionScope = undefined as (() => void)[] | undefined;

export function batchReactions(action: () => void) {
    let outerScope = reactionScope;
    let innerScope = reactionScope = [] as (() => void)[];

    try {
        action();

        if (innerScope.length) {
            batchReactions(() => {
                for (let reaction of innerScope)
                    reaction();
            });
        }
    } finally {
        reactionScope = outerScope;
    }
}

export function addReaction(reaction: () => void) {
    if (reactionScope)
        reactionScope.push(reaction);
    else
        reaction();
}