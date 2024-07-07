/* eslint-disable jsdoc/require-jsdoc */
import { workerData as nodeWorkerData } from 'worker_threads';

import { BaseWorkerData } from '../../models';
import { reportCompletion } from '../../services';

type TimeoutWorkerData = BaseWorkerData & {
    timeout: number
};

const workerData: TimeoutWorkerData | undefined = nodeWorkerData as TimeoutWorkerData | undefined;

if (!workerData) {
    //@ts-ignore-next-line
    return;
}

setTimeout(() => reportCompletion(), workerData.timeout);