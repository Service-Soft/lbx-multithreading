/* eslint-disable no-console */
import { availableParallelism } from 'node:os';
import path from 'node:path';

import { juggler } from '@loopback/repository';
import { expect, SinonSpy, sinon } from '@loopback/testlab';

import { BaseWorkerData, ThreadJob, ThreadJobEntity, ThreadJobStatus } from '../models';
import { ThreadJobEntityRepository } from '../repositories';
import { ThreadJobService } from '../services';

const emptyJsWorkerFilePath: string = path.join(__dirname, 'mocks', 'empty-js-worker-file.mock.js');
const emptyTsWorkerFilePath: string = path.join(__dirname, 'mocks', 'empty-ts-worker-file.mock.js');
const fibonacciJsWorkerFilePath: string = path.join(__dirname, 'mocks', 'fibonacci-js-worker-file.mock.js');
const errorTsWorkerFilePath: string = path.join(__dirname, 'mocks', 'error-ts-worker-file.mock.js');
const timeoutTsWorkerFilePath: string = path.join(__dirname, 'mocks', 'timeout-ts-worker-file.mock.js');

const osThreads: number = availableParallelism();

const testDb: juggler.DataSource = new juggler.DataSource({
    name: 'db',
    connector: 'memory'
});
const repository: ThreadJobEntityRepository = new ThreadJobEntityRepository(testDb);

let threadJobService: ThreadJobService;
let logSpy: SinonSpy | undefined;
let infoSpy: SinonSpy | undefined;
let errorSpy: SinonSpy | undefined;

describe('ThreadJobService', () => {
    it('should initialize correctly', async () => {
        threadJobService = new ThreadJobService(repository);
        await threadJobService.waitForInitialization();
        expect(threadJobService['idleWorkers'].filter(w => !w.priority).length).to.equal(osThreads - 1);
        expect(threadJobService['idleWorkers'].filter(w => !w.priority).length).to.be.above(1);
        expect(threadJobService['idleWorkers'].filter(w => w.priority).length).to.equal(1);
        expect(threadJobService['queue'].length).to.equal(0);

        threadJobService = new ThreadJobService(repository, 1);
        expect(threadJobService['idleWorkers'].filter(w => !w.priority).length).to.equal(1);
        expect(threadJobService['idleWorkers'].filter(w => w.priority).length).to.equal(osThreads - 1);
        expect(threadJobService['queue'].length).to.equal(0);

        threadJobService = new ThreadJobService(repository, 1, 1);
        expect(threadJobService['idleWorkers'].filter(w => !w.priority).length).to.equal(1);
        expect(threadJobService['idleWorkers'].filter(w => w.priority).length).to.equal(1);
        expect(threadJobService['queue'].length).to.equal(0);

        expect(() => threadJobService = new ThreadJobService(repository, 800)).to.throwError(`The thread job service was configured to start up to 800 (800 + 0) workers, but there are only ${osThreads} threads available`);
        expect(() => threadJobService = new ThreadJobService(repository, 0)).to.throwError('The thread job service was configured to have less than 1 thread available. It will not be able to execute anything.');
    });

    it('should queue and initialize a thread job from a js worker file', async () => {
        threadJobService = new ThreadJobService(repository, 1);
        await threadJobService.waitForInitialization();
        threadJobService['idleWorkers'] = [];
        const id: string = await threadJobService.queueThreadJob({ workerData: { filePath: emptyJsWorkerFilePath } });

        expect(threadJobService['queue'].length).to.equal(1);
        const job: ThreadJob<BaseWorkerData, unknown> = threadJobService['queue'][0];
        expect(job.workerData.filePath).to.equal(emptyJsWorkerFilePath);
        expect(job.progress).to.equal(0);
        expect(job.id).to.equal(id);
        expect(job.status).to.equal(ThreadJobStatus.IN_QUEUE);
        expect(job.error).to.be.undefined();
        expect(job.onError).to.be.undefined();
        expect(job.onComplete).to.be.undefined();
        expect(job.onComplete).to.be.undefined();
        expect(job.queuedAtMs).to.be.greaterThan(0);
        expect(job.startedAtMs).to.be.undefined();
        expect(job.stoppedAtMs).to.be.undefined();
        expect(job.threadId).to.be.undefined();
        expect(job.timeout).to.equal(3600000);
    });

    it('should queue and initialize a thread job from a ts worker file', async () => {
        threadJobService = new ThreadJobService(repository, 1);
        await threadJobService.waitForInitialization();
        threadJobService['idleWorkers'] = [];
        const id: string = await threadJobService.queueThreadJob({ workerData: { filePath: emptyTsWorkerFilePath } });

        expect(threadJobService['queue'].length).to.equal(1);
        const job: ThreadJob<BaseWorkerData, unknown> = threadJobService['queue'][0];
        expect(job.workerData.filePath).to.equal(emptyTsWorkerFilePath);
        expect(job.progress).to.equal(0);
        expect(job.id).to.equal(id);
        expect(job.status).to.equal(ThreadJobStatus.IN_QUEUE);
        expect(job.error).to.be.undefined();
        expect(job.onError).to.be.undefined();
        expect(job.onComplete).to.be.undefined();
        expect(job.onComplete).to.be.undefined();
        expect(job.queuedAtMs).to.be.greaterThan(0);
        expect(job.startedAtMs).to.be.undefined();
        expect(job.stoppedAtMs).to.be.undefined();
        expect(job.threadId).to.be.undefined();
        expect(job.timeout).to.equal(3600000);
    });

    it('should queue and run a thread job from a js worker file', async () => {
        threadJobService = new ThreadJobService(repository, 1);
        await threadJobService.waitForInitialization();
        logSpy = sinon.spy(console, 'log');
        infoSpy = sinon.spy(console, 'info');
        errorSpy = sinon.spy(console, 'error');

        performance.mark('start');
        await threadJobService.runThreadJob({
            workerData: { filePath: emptyJsWorkerFilePath },
            onMessage: m => console.log(m),
            onComplete: () => console.info(
                'completed the job',
                `in ${performance.measure('total', 'start').duration.toFixed(2)} ms`
            ),
            onError: error => console.error(error),
            onCancel: () => console.log('job was cancelled')
        });

        expect(logSpy.calledOnce).to.be.true();
        expect(logSpy.calledWith('This is a custom message')).to.be.true();
        expect(infoSpy.calledOnce).to.be.true();
        expect(infoSpy.calledWith('completed the job')).to.be.true();
        expect(errorSpy.called).to.be.false();
        const job: ThreadJobEntity<BaseWorkerData, unknown> = (await repository.find())[0];
        expect(job.error).to.be.undefined();
        expect(job.progress).to.equal(100);
        expect(job.startedAtMs).to.not.be.undefined();
        expect(job.status).to.equal(ThreadJobStatus.COMPLETED);
        expect(job.stoppedAtMs).to.not.be.undefined();
        expect(job.threadId).to.be.undefined();
        expect(job.timeout).to.equal(3600000);
    });

    it('should queue and run a thread job from a ts worker file', async () => {
        threadJobService = new ThreadJobService(repository, 1);
        await threadJobService.waitForInitialization();
        logSpy = sinon.spy(console, 'log');
        infoSpy = sinon.spy(console, 'info');
        errorSpy = sinon.spy(console, 'error');

        performance.mark('start');
        await threadJobService.runThreadJob({
            workerData: { filePath: emptyTsWorkerFilePath },
            onMessage: m => console.log(m),
            onComplete: () => console.info(
                'completed the job',
                `in ${performance.measure('total', 'start').duration.toFixed(2)} ms`
            ),
            onError: error => console.error(error),
            onCancel: () => console.log('job was cancelled')
        });

        expect(logSpy.calledOnce).to.be.true();
        expect(logSpy.calledWith('This is a custom message')).to.be.true();
        expect(infoSpy.calledOnce).to.be.true();
        expect(infoSpy.calledWith('completed the job')).to.be.true();
        expect(errorSpy.called).to.be.false();
        const job: ThreadJobEntity<BaseWorkerData, unknown> = (await repository.find())[0];
        expect(job.error).to.be.undefined();
        expect(job.progress).to.equal(100);
        expect(job.startedAtMs).to.not.be.undefined();
        expect(job.status).to.equal(ThreadJobStatus.COMPLETED);
        expect(job.stoppedAtMs).to.not.be.undefined();
        expect(job.threadId).to.be.undefined();
        expect(job.timeout).to.equal(3600000);
    });

    it('should do fibonacci with js file', async () => {
        threadJobService = new ThreadJobService(repository, 1);
        await threadJobService.waitForInitialization();

        logSpy = sinon.spy(console, 'log');
        performance.mark('start');
        await threadJobService.runThreadJob({
            workerData: { filePath: fibonacciJsWorkerFilePath, startValue: 20 },
            onMessage: m => console.log(m),
            onComplete: () => console.log('completed the job', `in ${performance.measure('total', 'start').duration.toFixed(2)} ms`),
            onError: error => console.log(error),
            onCancel: () => console.log('job was cancelled')
        });
        expect(logSpy.calledTwice).to.be.true();
        expect(logSpy.calledWith('got the final result: 6765')).to.be.true();
        expect(logSpy.calledWith('completed the job')).to.be.true();
        const job: ThreadJobEntity<BaseWorkerData, unknown> = (await repository.find())[0];
        expect(job.result).to.equal(6765);
    });

    // is done in the heavy test
    // it('should do fibonacci with ts file')

    it('should handle an error correctly', async () => {
        threadJobService = new ThreadJobService(repository, 1, 0);
        await threadJobService.waitForInitialization();
        errorSpy = sinon.spy(console, 'error');
        logSpy = sinon.spy(console, 'log');
        infoSpy = sinon.spy(console, 'info');

        await threadJobService.runThreadJob({
            workerData: { filePath: errorTsWorkerFilePath },
            onMessage: m => console.log(m),
            onComplete: () => console.info('completed the job'),
            onError: error => console.error(error),
            onCancel: () => console.log('job was cancelled')
        });

        expect(errorSpy.calledOnce).to.be.true();
        expect(threadJobService['idleWorkers'].length).to.equal(1);

        await threadJobService.runThreadJob({
            workerData: { filePath: emptyTsWorkerFilePath },
            onMessage: m => console.log(m),
            onComplete: () => console.info('completed the job'),
            onError: error => console.error(error),
            onCancel: () => console.log('job was cancelled')
        });

        expect(errorSpy.calledOnce).to.be.true();
        expect(logSpy.calledOnce).to.be.true();
        expect(logSpy.calledWith('This is a custom message')).to.be.true();
        expect(infoSpy.calledOnce).to.be.true();
        expect(infoSpy.calledWith('completed the job')).to.be.true();
    });

    it('should handle a timeout / worker crash correctly', async () => {
        threadJobService = new ThreadJobService(repository, 1, 0);
        await threadJobService.waitForInitialization();
        logSpy = sinon.spy(console, 'log');
        const handleWorkerErrorSpy: SinonSpy = sinon.spy(threadJobService, 'handleWorkerError' as keyof ThreadJobService);
        const handleWorkerExitSpy: SinonSpy = sinon.spy(threadJobService, 'handleWorkerExit' as keyof ThreadJobService);

        await threadJobService.runThreadJob({
            workerData: { filePath: fibonacciJsWorkerFilePath, startValue: 45 },
            timeout: 1000,
            onMessage: m => console.log(m),
            onComplete: () => console.log('completed the timeout job'),
            onError: error => console.log(error),
            onCancel: () => console.log('job was cancelled')
        });
        expect((await repository.find())[0].status).to.equal(ThreadJobStatus.FAILED);
        expect(threadJobService['idleWorkers'].length).to.equal(1);
        expect(logSpy.callCount).to.equal(0);
        expect(handleWorkerErrorSpy.callCount).to.equal(0);
        expect(handleWorkerExitSpy.calledOnce).to.be.true();

        handleWorkerErrorSpy.restore();
        handleWorkerExitSpy.restore();
    });

    it('should be able to run a priority job when all normal workers are taken', async () => {
        threadJobService = new ThreadJobService(repository, 1, 1);
        await threadJobService.waitForInitialization();
        logSpy = sinon.spy(console, 'log');

        // this should be directly run, as the queue is empty
        await threadJobService.queueThreadJob({
            workerData: { filePath: timeoutTsWorkerFilePath, timeout: 2000 },
            onMessage: m => console.log(m),
            onComplete: () => console.log('completed the first timeout job', threadJobService['queue'].filter(j => j.status === ThreadJobStatus.IN_QUEUE).length),
            onError: error => console.log(error),
            onCancel: () => console.log('job was cancelled')
        });
        // this should be in queue as the normal worker is blocked by the job above
        const jobId2: string = await threadJobService.queueThreadJob({
            workerData: { filePath: timeoutTsWorkerFilePath, timeout: 10 },
            onMessage: m => console.log(m),
            onComplete: () => console.log('completed the second timeout job', threadJobService['queue'].filter(j => j.status === ThreadJobStatus.IN_QUEUE).length),
            onError: error => console.log(error),
            onCancel: () => console.log('job was cancelled')
        });
        expect(threadJobService['queue'].filter(j => j.status === ThreadJobStatus.IN_QUEUE).length).to.equal(1);
        // this should be directly run as there is a priority worker available
        const jobId3: string = await threadJobService.queueThreadJob({
            workerData: { filePath: emptyTsWorkerFilePath },
            priority: true,
            onMessage: m => console.log(m),
            onComplete: () => console.log('completed the priority job', threadJobService['queue'].filter(j => j.status === ThreadJobStatus.IN_QUEUE).length),
            onError: error => console.log(error),
            onCancel: () => console.log('job was cancelled')
        });
        expect(threadJobService['queue'].filter(j => j.status === ThreadJobStatus.IN_QUEUE).length).to.equal(1);
        // job1 should be running, job2 should be in queue
        await threadJobService.waitForThreadJob(jobId3);
        expect(threadJobService['queue'].filter(j => j.status === ThreadJobStatus.IN_QUEUE).length).to.equal(1);
        expect(logSpy.calledTwice).to.be.true();
        expect(logSpy.calledWith('This is a custom message')).to.be.true();
        expect(logSpy.calledWith('completed the priority job')).to.be.true();

        await threadJobService.waitForThreadJob(jobId2);
        const completedJobs: ThreadJobEntity<BaseWorkerData, unknown>[] = (await repository.find()).filter(j => j.status === ThreadJobStatus.COMPLETED);
        expect(completedJobs.length).to.equal(3);
        expect(logSpy.callCount).to.equal(4);
        expect(logSpy.calledWith('completed the first timeout job')).to.be.true();
        expect(logSpy.calledWith('completed the second timeout job')).to.be.true();
    });

    it('should be able to requeue a thread job', async () => {
        threadJobService = new ThreadJobService(repository, 1, 0);
        await threadJobService.waitForInitialization();
        logSpy = sinon.spy(console, 'log');
        const jobId: string = await threadJobService.queueThreadJob({
            workerData: { filePath: timeoutTsWorkerFilePath, timeout: 2000 },
            onMessage: m => console.log(m),
            onComplete: () => console.log('completed the job'),
            onError: error => console.log(error),
            onCancel: () => console.log('job was cancelled')
        });

        await threadJobService.shutdown();
        threadJobService = new ThreadJobService(repository, 1, 0);
        await threadJobService.waitForInitialization();

        const jobBeforeRequeue: ThreadJobEntity<BaseWorkerData, unknown> = (await repository.find())[0];
        expect(jobBeforeRequeue.status).to.equal(ThreadJobStatus.FAILED);
        expect(jobBeforeRequeue.error).to.be.undefined();
        expect(jobBeforeRequeue.startedAtMs).to.not.be.undefined();
        expect(jobBeforeRequeue.stoppedAtMs).to.not.be.undefined();
        expect(jobBeforeRequeue.id).to.equal(jobId);
        expect(logSpy.callCount).to.equal(0);

        await threadJobService.requeueThreadJob(jobId, {
            onMessage: m => console.log(m),
            onComplete: () => console.log('completed the job'),
            onError: error => console.log(error),
            onCancel: () => console.log('job was cancelled')
        });

        const jobBeforeCompletion: ThreadJobEntity<BaseWorkerData, unknown> = (await repository.find())[0];
        expect(jobBeforeCompletion.status).to.equal(ThreadJobStatus.IN_PROGRESS);
        expect(jobBeforeCompletion.error).to.be.undefined();
        // there is a free worker available => the job should directly start
        expect(jobBeforeCompletion.queuedAtMs).to.not.equal(jobBeforeRequeue.queuedAtMs);
        expect(jobBeforeCompletion.startedAtMs).to.not.equal(jobBeforeRequeue.startedAtMs);
        expect(jobBeforeCompletion.startedAtMs).to.not.be.undefined();
        expect(jobBeforeCompletion.stoppedAtMs).to.be.undefined();
        expect(jobBeforeCompletion.id).to.equal(jobId);
        expect(logSpy.callCount).to.equal(0);

        await threadJobService.waitForThreadJob(jobId);

        const jobAfterCompletion: ThreadJobEntity<BaseWorkerData, unknown> = (await repository.find())[0];
        expect(jobAfterCompletion.status).to.equal(ThreadJobStatus.COMPLETED);
        expect(jobAfterCompletion.error).to.be.undefined();
        expect(jobAfterCompletion.startedAtMs).to.equal(jobBeforeCompletion.startedAtMs);
        expect(jobAfterCompletion.stoppedAtMs).to.not.be.undefined();
        expect(jobAfterCompletion.priority).to.equal(false);
        expect(logSpy.calledOnce).to.be.true();
    });

    it('should be able to run a simple function', async () => {
        threadJobService = new ThreadJobService(repository, 1, 0);
        await threadJobService.waitForInitialization();

        function fibonacci(n: number): number {
            if (n <= 1) {
                return n;
            }
            return fibonacci(n - 1) + fibonacci(n - 2);
        }

        const res: number = await threadJobService.run(fibonacci, 20);
        expect(res).to.equal(6765);
        expect(threadJobService['queue'].length).to.equal(0);
        expect(threadJobService['idleWorkers'].length).to.equal(1);
    });

    it('should throw an error when calling run', async () => {
        threadJobService = new ThreadJobService(repository, 1, 0);
        await threadJobService.waitForInitialization();

        await expect(threadJobService.run(() => {
            throw new Error('Test');
        }, undefined)).to.be.rejectedWith(Error);
        expect(threadJobService['queue'].length).to.equal(0);
        expect(threadJobService['idleWorkers'].length).to.equal(1);
    });

    afterEach(async () => {
        logSpy?.restore();
        infoSpy?.restore();
        errorSpy?.restore();
        performance.clearMarks();
        await threadJobService.shutdown();
        await repository.deleteAll();
    });
});