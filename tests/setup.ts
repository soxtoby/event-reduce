import "jsdom-global/register";
import { cleanup } from "@testing-library/react";
import { should, use } from 'chai';
import * as chaiDom from "chai-dom";
import { PromiseQueue, reactionQueue } from "event-reduce/lib/reactions";
import * as sinonChai from 'sinon-chai';
import { SynchronousPromise } from "synchronous-promise";
import { ITest, ITestContext, TestMiddleware } from "wattle";

should();
use(sinonChai);
use(chaiDom);

reactionQueue.current = new PromiseQueue(SynchronousPromise.resolve());

class Middleware extends TestMiddleware {
    override run(test: ITest, context: ITestContext, next: () => void) {
        if (!test.parent) {
            SynchronousPromise.installGlobally(() => { });
        }

        next();

        if (!test.parent) {
            cleanup();
            SynchronousPromise.uninstallGlobally();
        }
    }
}

export default new Middleware();