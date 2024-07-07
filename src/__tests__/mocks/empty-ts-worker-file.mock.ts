import { parentPort } from 'node:worker_threads';

import { reportCompletion } from '../../services';

parentPort?.postMessage('This is a custom message');

reportCompletion();