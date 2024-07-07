# lbx-multithreading
This packages aims to take care of most of your multi threading concerns, including:
- a reusable worker pool that is automatically sized based on the available threads (can be [configured](#optional-configuration))
- support for typescript out of the box
- a way to run worker files, being really close to the original implementation
- a simple way to run a function in a separate thread
- storing data about your thread jobs like status, error etc. inside the database
- utility functions to easily update the progress, status, error or result of the job
- configurable timeouts for jobs and self healing capabilities of the worker pool

This library was built with customization in mind, so most things can easily be modified.

# Usage
## Register the component
The minimum required code changes to use the library to its full extend is simply registering it in the `application.ts`:
```typescript
import { LbxMultithreadingComponent, ThreadJobEntityRepository } from 'lbx-multithreading';

export class MyApplication extends BootMixin(ServiceMixin(RepositoryMixin(RestApplication))) {
    constructor(options: ApplicationConfig = {}) {
        // ...
        this.component(LbxMultithreadingComponent);
        this.repository(ThreadJobEntityRepository);
        // ...
    }
}
```

### (optional) Configuration
Below you can see the bindings of the library that you can override:
```ts
/* eslint-disable jsdoc/require-jsdoc */
import { BindingKey, CoreBindings } from '@loopback/core';

import { LbxMultithreadingComponent } from './component';
import { ThreadJobService } from './services';

/**
 * Binding keys used by the lbx-multithreading library.
 */
// eslint-disable-next-line typescript/no-namespace
export namespace LbxMultithreadingBindings {
    export const COMPONENT: BindingKey<LbxMultithreadingComponent> = BindingKey.create(
        `${CoreBindings.COMPONENTS}.LbxMultithreadingComponent`
    );
    /**
     * The key of the datasource.
     */
    export const DATASOURCE_KEY: string = 'datasources.db';
    /**
     * The key of the repository responsible for the thread job entities.
     */
    export const THREAD_JOB_ENTITY_REPOSITORY: string = 'repositories.ThreadJobEntityRepository';
    /**
     * The key of the service responsible for handling thread jobs.
     */
    export const THREAD_JOB_SERVICE: BindingKey<ThreadJobService> = BindingKey.create(`${COMPONENT}.threadJobService`);
    /**
     * The number of threads that can be used.
     * Please notice that there is also **MAX_PRIORITY_THREADS** for the number of threads that should be reserved for priority jobs.
     * Both these values added up need to be smaller than your current machines available threads.
     * @default os.availableParallelism() - 1 (the -1 is reserved for a priority thread)
     */
    export const MAX_THREADS: BindingKey<number> = BindingKey.create(`${COMPONENT}.maxThreads`);
    /**
     * The number of threads that can be used by priority jobs.
     * Please notice that there is also **MAX_THREADS** for the number of threads that can be used by normal and priority jobs.
     * Both these values added up need to be smaller than your current machines available threads.
     * @default 1
     */
    export const MAX_PRIORITY_THREADS: BindingKey<number> = BindingKey.create(`${COMPONENT}.maxPriorityThreads`);
}
```

### Wait for service startup
At startup, the service initiates a worker pool. This will only take a few seconds and is most likely not a concern for you.

But if you want to use the threadJobService directly at startup, you should probably use `waitForInitialization` method to make sure everything is ready.

## Queue and run a thread job
If you have some more complex tasks where you also want to be able to report progress during runtime you will probably queue a thread job.

There are 3 methods provided by the thread job service for that:
- queueThreadJob
- waitForThreadJob
- runThreadJob (a combination of the two methods above)

To queue/run a thread job you need to provide some thread job data:

```ts
const jobId: string = await this.threadJobService.queueThreadJob({
    workerData: {
        filePath: './fibonacci.worker.ts', // .ts and .js both work
        startValue: 20
    }
});
// const threadJobEntity = await this.threadJobService.waitForThreadJob(jobId);
```

Let's take a look at the worker file under `fibonacci.worker.ts`:

### Worker file definition

The provided worker file needs to work a bit different than a normal one:

```ts
/* eslint-disable jsdoc/require-jsdoc */
import { parentPort, workerData as nodeWorkerData } from 'node:worker_threads';

import { BaseWorkerData, reportCompletion, reportError } from 'lbx-multithreading';

type FibonacciWorkerData = BaseWorkerData & {
    startValue: number
};

const workerData: FibonacciWorkerData | undefined = nodeWorkerData as FibonacciWorkerData | undefined;

if (!workerData) {
    //@ts-ignore-next-line
    return;
}

function fibonacci(n: number): number {
    if (n <= 1) {
        return n;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}

try {
    const res: number = fibonacci(workerData.startValue);
    reportCompletion(res);
}
catch (error) {
    reportError(error as Error);
}
```

The `reportCompletion` and `reportError` parts are really important, as the thread job would run into a timeout without them.

If you have a long running thread job where you want to know about the progress, you can also use the `reportProgress(percentNumber)` to do that.
<br>
Please note that this will result in a job completion when you report 100, so be sure that you round down this value if you set it dynamically.

## Run a simple function

You can run simple functions on a separate thread by using the `run` method of the `ThreadJobService`.
<br>
This returns the result of the function call or rejects with an error.

> **Restrictions**
> - It is expected that only known and trusted functions are passed to this method, as `eval` is used under the hood
> -  Imports won't be resolved when the code is executed on the thread, which means that your function should only use things that are globally available (eg. console.log) or passed via the second argument
> -  The run will not be stored inside a database, and the utility functions like `reportProgress` will not work

By default this is also run with priority. This is because the execution time will probably be not that long. (Because you can await the result.)
<br>
You can however also add a fourth parameter to define whether or not it should run with priority.

```ts
import { service } from '@loopback/core';

function fibonacci(n: number): number {
    if (n <= 1) {
        return n;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}

//...
export class MyClass {
    constructor(
        @service(ThreadJobService)
        private readonly threadJobService: ThreadJobService
    ) {}

    runFibonacci(): number {
        const res: number = await this.threadJobService.run(fibonacci, 20);
        return res;
    }
}
//...
```