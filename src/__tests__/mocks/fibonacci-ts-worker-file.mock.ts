/* eslint-disable jsdoc/require-jsdoc */
import { parentPort, workerData as nodeWorkerData } from 'node:worker_threads';

import { BaseWorkerData } from '../../models';
import { reportCompletion } from '../../services';

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

const res: number = fibonacci(workerData.startValue);

parentPort?.postMessage(`got the final result: ${res}`);

reportCompletion();