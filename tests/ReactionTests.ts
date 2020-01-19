import { addReaction, batchReactions } from "event-reduce/lib/reactions";
import { spy } from "sinon";
import { describe, then, when } from "wattle";

describe("reactions", function () {
    when("reactions aren't being batched", () => {
        then("reaction called immediately", () => {
            let reaction = spy();
            addReaction(reaction);
            reaction.should.have.been.called;
        });
    });

    when("reactions are batched", () => {
        let insideAction = false;
        let reaction = spy(() => insideAction);
        batchReactions(() => {
            insideAction = true;
            addReaction(reaction);
            insideAction = false;
        });

        then("reaction called after action is complete", () => reaction.should.have.been.calledOnce.and.returned(false));
    });
});