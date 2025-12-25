import "jsdom-global/register";
import { cleanup } from "@testing-library/react";
import { reactionQueue } from "event-reduce/lib/reactions";
import { SynchronousPromise } from "synchronous-promise";
import { beforeEach, afterEach } from "bun:test";
import { Action } from "event-reduce/lib/types";

reactionQueue.current = {
    add(reaction: Action) {
        reaction();
        return () => { }
    }
}

beforeEach(() => {
    SynchronousPromise.installGlobally(() => { });
});

afterEach(() => {
    cleanup();
    SynchronousPromise.uninstallGlobally();
});