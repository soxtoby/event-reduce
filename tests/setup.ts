import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup } from "@testing-library/react";
import { reactionQueue } from "event-reduce/lib/reactions";
import { afterEach } from "bun:test";
import { Action } from "event-reduce/lib/types";

GlobalRegistrator.register();

reactionQueue.current = {
    add(reaction: Action) {
        reaction();
        return () => { }
    }
}

afterEach(() => {
    cleanup();
});