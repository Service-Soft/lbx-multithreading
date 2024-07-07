import { parentPort } from 'node:worker_threads';

if (parentPort) {
    throw new Error('Something in the thread job did not work');
}