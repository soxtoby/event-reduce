import "jsdom-global/register";
import { cleanup } from "@testing-library/react";
import { should, use } from 'chai';
import * as chaiDom from "chai-dom";
import * as sinonChai from 'sinon-chai';
import { SynchronousPromise } from "synchronous-promise";
import { ITest, ITestContext, TestMiddleware } from "wattle";
import { performance } from "perf_hooks";

should();
use(sinonChai);
use(chaiDom);

(global as any).performance = performance;

class Middleware extends TestMiddleware {
    run(test: ITest, context: ITestContext, next: () => void) {
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