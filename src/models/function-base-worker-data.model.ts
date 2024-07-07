import { BaseWorkerData } from './base-worker-data.model';

/**
 * The data to run a function in the thread worker.
 *
 * **IMPORTANT**: This uses "eval" in the thread worker, so make sure that the data passed is not malicious.
 */
export type FunctionWorkerData<I> = BaseWorkerData & {
    /**
     * A stringified function to call in the worker.
     */
    func: string,
    /**
     * The input parameter of the function.
     */
    input: I
};