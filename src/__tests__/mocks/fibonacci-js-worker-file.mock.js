/* eslint-disable jsdoc/require-jsdoc */
import { parentPort, workerData } from 'node:worker_threads';

import { reportCompletion } from '../../services';

if (!workerData || !parentPort) {
    return;
}

function fibonacci(n) {
    if (n <= 1) {
        return n;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}

const res = fibonacci(workerData.startValue);

parentPort.postMessage(`got the final result: ${res}`);

reportCompletion(res);