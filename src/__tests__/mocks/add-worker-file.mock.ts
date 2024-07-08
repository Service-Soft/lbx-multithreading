/* eslint-disable jsdoc/require-jsdoc */
import { parentPort, workerData as nodeWorkerData } from 'node:worker_threads';

import { BaseWorkerData } from '../../models';
import { reportCompletion } from '../../services';

type AddWorkerData = BaseWorkerData & {
    size: number
};

const workerData: AddWorkerData | undefined = nodeWorkerData as AddWorkerData | undefined;

if (!workerData) {
    //@ts-ignore-next-line
    return;
}

function generateLargeArray(size: number): number[] {
    return Array.from({ length: size }, () => Math.random());
}

function calculateSum(arr: number[]): number {
    return arr.reduce((acc, num) => acc + num, 0);
}

const array: number[] = generateLargeArray(workerData.size);
const res: number = calculateSum(array);

parentPort?.postMessage(`got the final result: ${res}`);

reportCompletion();