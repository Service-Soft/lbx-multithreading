/**
 * The base data for a worker.
 */
export type BaseWorkerData = {
    /**
     * The path to the worker file.
     * **This can either be a ts or a js file**.
     */
    filePath: string
};