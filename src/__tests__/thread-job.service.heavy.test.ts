/* eslint-disable typescript/no-loop-func */
/* eslint-disable no-console */
import { availableParallelism } from 'node:os';
import path from 'node:path';

import { juggler } from '@loopback/repository';
import { expect, SinonSpy, sinon } from '@loopback/testlab';

import { ThreadJobEntity } from '../models';
import { BaseWorkerData } from '../models/base-worker-data.model';
import { ThreadJobEntityRepository } from '../repositories';
import { ThreadJobService } from '../services';

const emptyTsWorkerFilePath: string = path.join(__dirname, 'mocks', 'empty-ts-worker-file.mock.js');
const fibonacciTsWorkerFilePath: string = path.join(__dirname, 'mocks', 'fibonacci-ts-worker-file.mock.js');
const timeoutWorkerFilePath: string = path.join(__dirname, 'mocks', 'timeout-ts-worker-file.mock.ts');

const osThreads: number = availableParallelism();

const testDb: juggler.DataSource = new juggler.DataSource({
    name: 'db',
    connector: 'memory'
});
const repository: ThreadJobEntityRepository = new ThreadJobEntityRepository(testDb);

let threadJobService: ThreadJobService;
let logSpy: SinonSpy | undefined;

describe('ThreadJobService heavy tasks', () => {

    it('should do fibonacci with ts file', async () => {
        threadJobService = new ThreadJobService(repository, 2, 0);
        await threadJobService.waitForInitialization();

        logSpy = sinon.spy(console, 'log');
        performance.mark('start');
        const jobId: string = await threadJobService.queueThreadJob({
            workerData: { filePath: fibonacciTsWorkerFilePath, startValue: 45 },
            onMessage: m => console.log(m),
            onComplete: () => {
                performance.mark('fibonacciCompleted');
                console.log('completed the job', `in ${performance.measure('totalFibonacci', 'start').duration.toFixed(2)} ms`);
            },
            onError: error => console.log(error),
            onCancel: () => console.log('job was cancelled')
        });
        console.info('starts empty thread job', threadJobService['idleWorkers'].length);
        performance.mark('startedEmptyJob');
        await threadJobService.runThreadJob({
            workerData: { filePath: emptyTsWorkerFilePath },
            onMessage: m => console.log(m),
            onComplete: () => console.log('completed the job', `in ${performance.measure('totalEmptyJob', 'start').duration.toFixed(2)} ms`),
            onError: error => console.log(error),
            onCancel: () => console.log('job was cancelled')
        });
        console.info('finished empty thread job', logSpy.callCount);
        performance.mark('finishedEmptyJob');
        expect(logSpy.calledTwice).to.be.true();
        expect(logSpy.calledWith('This is a custom message')).to.be.true();
        expect(logSpy.calledWith('completed the job')).to.be.true();

        console.info('waits for thread job');
        await threadJobService.waitForThreadJob(jobId);
        console.info('finished waiting for threadJob, time for both jobs:', performance.measure('total', 'start').duration.toFixed(2));

        const total: number = performance.measure('totalForBoth', 'start').duration;
        const fibonacci: number = performance.measure('fibonacci', 'start', 'fibonacciCompleted').duration;
        const emptyJob: number = performance.measure('emptyThreadJobTime', 'startedEmptyJob', 'finishedEmptyJob').duration;
        expect(total + 1000).to.be.below(fibonacci + emptyJob);
        expect(logSpy.callCount).to.equal(4);
        expect(logSpy.calledWith('got the final result: 1134903170')).to.be.true();
        expect(logSpy.calledWith('completed the job')).to.be.true();
    }).timeout(40000);

    it('should have major improved performance', async () => {
        const timeout: number = 30000;
        const numberOfJobs: number = 4;
        // run with single core
        threadJobService = new ThreadJobService(repository, 1, 0);
        await threadJobService.waitForInitialization();
        console.log('starts with single thread');
        performance.mark('startSingleThread');
        const jobs: Promise<ThreadJobEntity<BaseWorkerData, unknown>>[] = [];
        for (let i: number = 0; i < numberOfJobs; i++) {
            jobs.push(
                threadJobService.runThreadJob({
                    workerData: { filePath: timeoutWorkerFilePath, timeout: timeout },
                    onMessage: m => console.log(m),
                    onComplete: () => {
                        console.log('completed the job', i, `in ${performance.measure('total-' + i, 'startSingleThread').duration.toFixed(2)} ms`);
                    },
                    onError: error => console.log(error),
                    onCancel: () => console.log('job was cancelled')
                })
            );
            console.log('pushed job for i', i);
        }
        console.log('waits for', jobs.length, 'jobs to finish');
        await Promise.all(jobs);
        console.log('ends with single thread\n\n');
        performance.mark('endSingleThread');
        const totalWithSingleThread: number = performance.measure('totalSingleThread', 'startSingleThread', 'endSingleThread').duration;
        await threadJobService.shutdown();
        // run with multi core
        threadJobService = new ThreadJobService(repository, osThreads);
        await threadJobService.waitForInitialization();
        console.log('starts with multi thread', threadJobService['idleWorkers'].length);
        performance.mark('start');
        const multiThreadJobs: Promise<ThreadJobEntity<BaseWorkerData, unknown>>[] = [];
        for (let i: number = 0; i < numberOfJobs; i++) {
            multiThreadJobs.push(
                threadJobService.runThreadJob({
                    workerData: { filePath: timeoutWorkerFilePath, timeout: timeout },
                    onMessage: m => console.log(m),
                    onComplete: () => {
                        console.log(
                            'completed the job',
                            i,
                            `in ${performance.measure('totalMultithread-' + i, 'start').duration.toFixed(2)} ms`
                        );
                    },
                    onError: error => console.log(error),
                    onCancel: () => console.log('job was cancelled')
                })
            );
        }
        console.log('waits for', multiThreadJobs.length, 'jobs to finish');
        await Promise.all(multiThreadJobs);
        console.log('ends with multi thread');
        performance.mark('end');

        const singleThreadJobDuration: number = getAverageJobDuration(await Promise.all(jobs));
        const multiThreadJobDuration: number = getAverageJobDuration(await Promise.all(multiThreadJobs));
        expect(multiThreadJobDuration * 0.8).to.be.below(singleThreadJobDuration);

        const totalWithMultiThread: number = performance.measure('totalMultiThread', 'start', 'end').duration;
        expect(totalWithMultiThread * (numberOfJobs - 1)).to.be.below(totalWithSingleThread);
    }).timeout(200000);

    afterEach(async () => {
        logSpy?.restore();
        performance.clearMarks();
        await threadJobService.shutdown();
        await repository.deleteAll();
    });
});

function getAverageJobDuration(jobs: ThreadJobEntity<BaseWorkerData, unknown>[]): number {
    const total: number = jobs.reduce((prev, next) => prev + (next.stoppedAtMs as number) - (next.startedAtMs as number), 0);
    return total / jobs.length;
}