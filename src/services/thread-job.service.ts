import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { BindingScope, bind, inject } from '@loopback/core';
import { filter, firstValueFrom } from 'rxjs';

import { UUIDUtilities } from '../encapsulation';
import { LbxMultithreadingBindings } from '../keys';
import { BaseWorkerData, ThreadJob, ThreadJobData, ThreadJobDataFunctions, ThreadJobEntity, ThreadJobMessage, ThreadJobStatus } from '../models';
import { FunctionWorkerData } from '../models/function-base-worker-data.model';
import { ThreadJobFunction } from '../models/thread-job-function.model';
import { ThreadJobWorker } from '../models/thread-job-worker.model';
import { ThreadJobEntityRepository } from '../repositories';

const threadJobWorkerFilePath: string = path.join(__dirname, 'worker', 'thread-job.worker.js');

/**
 * A service that handles thread jobs.
 */
@bind({ scope: BindingScope.TRANSIENT })
export class ThreadJobService {
    /**
     * All thread jobs.
     */
    private queue: ThreadJob<BaseWorkerData, unknown>[] = [];
    /**
     * The workers that are currently running.
     */
    private workers: ThreadJobWorker[] = [];
    /**
     * The workers that are currently idle.
     */
    private idleWorkers: ThreadJobWorker[] = [];

    constructor(
        @inject(LbxMultithreadingBindings.THREAD_JOB_ENTITY_REPOSITORY)
        private readonly threadJobEntityRepository: ThreadJobEntityRepository,
        @inject(LbxMultithreadingBindings.MAX_THREADS, { optional: true })
        maxLongTimeThreads: number = os.availableParallelism() - 1,
        @inject(LbxMultithreadingBindings.MAX_PRIORITY_THREADS, { optional: true })
        maxPriorityThreads: number = os.availableParallelism() - maxLongTimeThreads
    ) {
        maxPriorityThreads = maxPriorityThreads < 0 ? 0 : maxPriorityThreads;
        this.validateInputs(maxLongTimeThreads, maxPriorityThreads);

        for (let i: number = 0; i < maxLongTimeThreads; i++) {
            this.initWorker(false);
        }
        for (let i: number = 0; i < maxPriorityThreads; i++) {
            this.initWorker(true);
        }
    }

    private initWorker(priority: boolean): void {
        const worker: Worker = new Worker(threadJobWorkerFilePath);
        const threadJobWorker: ThreadJobWorker = new ThreadJobWorker(worker, priority, worker.threadId);
        worker.on('message', m => void this.handleWorkerMessage(m, threadJobWorker.threadId));
        worker.on('exit', code => void this.handleWorkerExit(code, threadJobWorker.threadId));
        worker.on('error', error => void this.handleWorkerError(error, threadJobWorker.threadId));
        this.idleWorkers.push(threadJobWorker);
    }

    private validateInputs(maxLongTimeThreads: number, maxPriorityThreads: number): void {
        const availableThreads: number = os.availableParallelism();
        const maxThreads: number = maxLongTimeThreads + maxPriorityThreads;
        if (maxThreads > availableThreads) {
            throw new Error(
                // eslint-disable-next-line stylistic/max-len
                `The thread job service was configured to start up to ${maxThreads} (${maxLongTimeThreads} + ${maxPriorityThreads}) workers, but there are only ${availableThreads} threads available`
            );
        }
        if (maxLongTimeThreads < 1) {
            throw new Error(
                'The thread job service was configured to have less than 1 thread available. It will not be able to execute anything.'
            );
        }
    }

    /**
     * Waits for all the workers to initialize.
     */
    async waitForInitialization(): Promise<void> {
        const workerPromises: Promise<boolean>[] = this.workers.map(w => firstValueFrom(w.isInitializingSubject.pipe(filter(i => !i))));
        // eslint-disable-next-line stylistic/max-len
        const idleWorkerPromises: Promise<boolean>[] = this.idleWorkers.map(w => firstValueFrom(w.isInitializingSubject.pipe(filter(i => !i))));
        await Promise.all([
            ...workerPromises,
            ...idleWorkerPromises
        ]);
    }

    /**
     * Creates and queues a thread job with the given data.
     * @param threadJobData - The data to create the thread job from.
     * @returns The id of the created thread job in the database and queue.
     * **This differs from the threadId, which is created by the os and set when the thread actually starts.**.
     */
    async queueThreadJob<WorkerData extends BaseWorkerData, ResultType>(threadJobData: ThreadJobData<WorkerData>): Promise<string> {
        const entityData: Omit<ThreadJobEntity<WorkerData, ResultType>, 'id' | 'getId' | 'getIdObject' | 'toObject' | 'toJSON'> = {
            queuedAtMs: Date.now(),
            status: ThreadJobStatus.IN_QUEUE,
            priority: threadJobData.priority ?? false,
            progress: 0,
            workerData: threadJobData.workerData,
            timeout: threadJobData.timeout ?? getDefaultTimeout(threadJobData.priority ?? false)
        };
        const entity: ThreadJobEntity<BaseWorkerData, unknown> = await this.threadJobEntityRepository.create(entityData);
        const threadJob: ThreadJob<BaseWorkerData, unknown> = new ThreadJob(entity, 'job', threadJobData);
        this.queue.push(threadJob);
        await this.startJobs();
        return threadJob.id;
    }

    /**
     * Queues a thread job for the given data and waits for its completion.
     * @param threadJobData - The data of the job to queue.
     * @returns The thread job.
     */
    async runThreadJob<WorkerData extends BaseWorkerData, ResultType>(
        threadJobData: ThreadJobData<WorkerData>
    ): Promise<ThreadJobEntity<WorkerData, ResultType>> {
        const jobId: string = await this.queueThreadJob(threadJobData);
        return this.waitForThreadJob<ResultType, WorkerData>(jobId);
    }

    /**
     * Runs the given function on a separate thread. This will not persist the state in the database.
     *
     * **IMPORTANT**: This uses "eval" in the thread worker, so make sure that the data passed is not malicious.
     * @param func - The function that should be run in a separate thread.
     * @param input - The input value of the function.
     * @param timeout - A custom timeout for the task. Defaults to 5 minutes or an hour, depending on the priority.
     * @param priority - Whether or not the function should make use of priority workers or not. Defaults to **true**.
     * @returns The result value of the function passed.
     * @throws When either the function itself throws an error or something didn't work during parsing/evaluation.
     */
    async run<InputType, ResultType>(
        func: ThreadJobFunction<InputType, ResultType>,
        input: InputType,
        timeout?: number,
        priority: boolean = true
    ): Promise<ResultType> {
        const entityData: Omit<
            ThreadJobEntity<FunctionWorkerData<InputType>, ResultType>,
            'getId' | 'getIdObject' | 'toObject' | 'toJSON'
        > = {
            id: UUIDUtilities.generate(),
            queuedAtMs: Date.now(),
            status: ThreadJobStatus.IN_QUEUE,
            priority: priority,
            progress: 0,
            workerData: {
                filePath: '',
                func: func.toString(),
                input: input
            },
            timeout: timeout ?? getDefaultTimeout(priority)
        };
        const threadJob: ThreadJob<BaseWorkerData, ResultType> = new ThreadJob(entityData, 'function');
        this.queue.push(threadJob);
        await this.startJobs();

        const finishedJob: ThreadJobEntity<FunctionWorkerData<InputType>, ResultType> = await this.waitForThreadJob(threadJob.id);

        if (finishedJob.status === ThreadJobStatus.COMPLETED) {
            return finishedJob.result as ResultType;
        }
        if (finishedJob.error) {
            throw finishedJob.error;
        }
        throw new Error(`Running the function "${func.name}" on a worker was not successful`);
    }

    /**
     * Requeues a thread job that was already completed.
     * @param jobId - The id of the job to requeue.
     * @param data - Additional data for the job.
     */
    async requeueThreadJob(jobId: string, data?: ThreadJobDataFunctions): Promise<void> {
        await this.threadJobEntityRepository.updateById(jobId, {
            error: undefined,
            progress: 0,
            queuedAtMs: Date.now(),
            status: ThreadJobStatus.IN_QUEUE,
            startedAtMs: undefined,
            stoppedAtMs: undefined
        });
        const entity: ThreadJobEntity<BaseWorkerData, unknown> = await this.threadJobEntityRepository.findById(jobId);
        const threadJob: ThreadJob<BaseWorkerData, unknown> = new ThreadJob(entity, 'job', data);

        this.queue.push(threadJob);
        await this.startJobs();
    }

    /**
     * Reruns a thread job that was already completed.
     * @param jobId - The id of the job to rerun.
     * @param data - Additional data for the job.
     * @returns The thread job.
     */
    async rerunThreadJob<WorkerData extends BaseWorkerData, ResultType>(
        jobId: string,
        data?: ThreadJobDataFunctions
    ): Promise<ThreadJobEntity<WorkerData, ResultType>> {
        await this.requeueThreadJob(jobId, data);
        return this.waitForThreadJob(jobId);
    }

    /**
     * Waits for the thread job with the given id to complete.
     * @param jobId - The id of the thread job to wait for.
     * @returns The thread job.
     */
    async waitForThreadJob<ResultType, WorkerData extends BaseWorkerData = BaseWorkerData>(
        jobId: string
    ): Promise<ThreadJobEntity<WorkerData, ResultType>> {
        const foundJob: ThreadJob<BaseWorkerData, unknown> | undefined = this.queue.find(j => j.id === jobId);
        if (!foundJob) {
            throw new Error(`No thread job with the id ${jobId} could be found in the queue.`);
        }
        await firstValueFrom(foundJob.completedSubject.pipe(filter(i => i)));
        if (foundJob.type === 'function') {
            const updatedJob: ThreadJob<BaseWorkerData, unknown> | undefined = this.queue.find(j => j.id === jobId);
            this.queue = this.queue.filter(j => j.id !== jobId);
            return updatedJob as unknown as ThreadJobEntity<WorkerData, ResultType>;
        }
        return await this.threadJobEntityRepository.findById(jobId) as ThreadJobEntity<WorkerData, ResultType>;
    }

    /**
     * Terminates all the workers.
     */
    async shutdown(): Promise<void> {
        await Promise.all([
            ...this.workers.map(w => w.worker.terminate()),
            ...this.idleWorkers.map(w => w.worker.terminate())
        ]);
        this.idleWorkers = [];
        this.workers = [];
        // queue will be empty because of the terminates.
        // this.queue = [];
    }

    private async startJobs(): Promise<void> {
        // check if a new job is available and can be started
        if (!this.idleWorkers.length) {
            return;
        }
        const waitingJobs: ThreadJob<BaseWorkerData, unknown>[] = this.queue.filter(job => job.status === ThreadJobStatus.IN_QUEUE);
        if (!waitingJobs.length) {
            return;
        }

        const waitingPriorityJobs: ThreadJob<BaseWorkerData, unknown>[] = waitingJobs.filter(j => j.priority);
        if (waitingPriorityJobs.length) {
            const waitingJob: ThreadJob<BaseWorkerData, unknown> = waitingPriorityJobs.sort((a, b) => b.queuedAtMs - a.queuedAtMs)[0];
            const idlePriorityWorker: ThreadJobWorker | undefined = this.idleWorkers.find(w => w.priority);
            if (idlePriorityWorker) {
                this.idleWorkers = this.idleWorkers.filter(w => w.threadId !== idlePriorityWorker.threadId);
                this.workers.push(idlePriorityWorker);
                await this.startJob(waitingJob, idlePriorityWorker);
                return;
            }
            // Try to use a normal worker as a fallback when no priority workers are available.
            // pop can be used here as there are idle workers and all of them are not priority.
            const idleWorker: ThreadJobWorker = this.idleWorkers.pop() as ThreadJobWorker;
            this.workers.push(idleWorker);
            await this.startJob(waitingJob, idleWorker);
            return;
        }

        // only "normal", not priority jobs remain here
        const waitingJob: ThreadJob<BaseWorkerData, unknown> = waitingJobs.sort((a, b) => b.queuedAtMs - a.queuedAtMs)[0];
        const idleWorker: ThreadJobWorker | undefined = this.idleWorkers.find(w => !w.priority);
        if (!idleWorker) {
            return;
        }

        this.idleWorkers = this.idleWorkers.filter(w => w.threadId !== idleWorker.threadId);
        this.workers.push(idleWorker);
        await this.startJob(waitingJob, idleWorker);
    }

    private async startJob(job: ThreadJob<BaseWorkerData, unknown>, worker: ThreadJobWorker): Promise<void> {
        worker.worker.postMessage(job.workerData);
        // eslint-disable-next-line typescript/no-misused-promises
        worker.timeout = setTimeout(async () => {
            await this.updateThreadJobById(job.id, { error: new Error('Timeout') });
            await worker.worker.terminate();
        }, job.timeout);
        await this.updateThreadJobById(
            job.id,
            { startedAtMs: Date.now(), status: ThreadJobStatus.IN_PROGRESS, threadId: worker.threadId }
        );
    }

    private async handleWorkerMessage<MessageType>(message: MessageType, threadId: number): Promise<void> {
        const job: ThreadJob<BaseWorkerData, unknown> | undefined = this.getJobByThreadId(threadId);
        if (!job) {
            if (this.isThreadJobMessage(message) && message.type === 'initialization') {
                this.handleInitializationMessage(threadId);
            }
            return;
        }
        if (!this.isThreadJobMessage(message)) {
            job.onMessage?.(message);
            return;
        }
        switch (message.type) {
            case 'progress':
                await this.updateThreadJobById(job.id, { progress: message.progress });
                if (message.progress === 100) {
                    await this.updateThreadJobById(
                        job.id,
                        { status: ThreadJobStatus.COMPLETED, threadId: undefined, stoppedAtMs: Date.now() }
                    );
                    job.onComplete?.();
                    await this.handleJobCompletion(job, threadId);
                }
                return;
            case 'completion':
                await this.updateThreadJobById(job.id, {
                    status: ThreadJobStatus.COMPLETED,
                    threadId: undefined,
                    stoppedAtMs: Date.now(),
                    progress: 100,
                    result: message.result
                });
                job.onComplete?.();
                await this.handleJobCompletion(job, threadId);
                return;
            case 'status':
                await this.updateThreadJobById(job.id, { status: message.status });
                return;
            case 'error':
                await this.updateThreadJobById(
                    job.id,
                    { status: ThreadJobStatus.FAILED, threadId: undefined, stoppedAtMs: Date.now(), error: message.error }
                );
                job.onError?.(message.error);
                await this.handleJobCompletion(job, threadId);
                return;
            case 'initialization':
                this.handleInitializationMessage(threadId);
        }
    }

    private async handleJobCompletion<WorkerData extends BaseWorkerData, ResultType>(
        job: ThreadJob<WorkerData, ResultType>,
        threadId: number
    ): Promise<void> {
        job.completedSubject.next(true);
        if (job.type === 'job') {
            this.queue = this.queue.filter(j => j.id !== job.id);
        }
        this.freeWorker(threadId);
        await this.startJobs();
    }

    private handleInitializationMessage(threadId: number): void {
        this.getWorkerByThreadId(threadId)?.isInitializingSubject.next(false);
    }

    private freeWorker(threadId: number): void {
        const foundWorker: ThreadJobWorker | undefined = this.getWorkerByThreadId(threadId);
        if (!foundWorker) {
            return;
        }
        clearTimeout(foundWorker.timeout);
        foundWorker.timeout = undefined;
        this.workers = this.workers.filter(w => w.threadId !== threadId);
        if (foundWorker.worker.threadId === -1) {
            // try to recover the worker thread.
            this.initWorker(foundWorker.priority);
            return;
        }
        this.idleWorkers.push(foundWorker);
    }

    private getJobByThreadId(threadId: number): ThreadJob<BaseWorkerData, unknown> | undefined {
        return this.queue.find(j => j.threadId === threadId);
    }

    private getWorkerByThreadId(threadId: number): ThreadJobWorker | undefined {
        return this.workers.find(w => w.threadId === threadId) ?? this.idleWorkers.find(w => w.threadId === threadId);
    }

    /**
     * This should only happen on shutdown.
     * To see where an error from the thread job is actually handled take a look at "handleWorkerMessage".
     * @param exitCode - The code that the worker exited with.
     * @param threadId - The thread id of the worker.
     */
    private async handleWorkerExit(exitCode: number, threadId: number): Promise<void> {
        const job: ThreadJob<BaseWorkerData, unknown> | undefined = this.getJobByThreadId(threadId);
        if (!job) {
            return;
        }
        if (exitCode !== 0) {
            await this.updateThreadJobById(job.id, {
                stoppedAtMs: Date.now(),
                status: ThreadJobStatus.FAILED,
                threadId: undefined
            });
            await this.handleJobCompletion(job, threadId);
            return;
        }
        await this.updateThreadJobById(job.id, {
            stoppedAtMs: Date.now(),
            status: ThreadJobStatus.CANCELLED,
            threadId: undefined
        });
        job.onCancel?.();
        await this.handleJobCompletion(job, threadId);
    }

    /**
     * This should actually never happen, as the whole worker crashes and not just the current task.
     * That's why the provided "onError"-method from the threadJob data is not called.
     * To see where an error from the thread job is actually handled take a look at "handleWorkerMessage".
     * @param error - The error that crashed the worker.
     * @param threadId - The threadId of the worker that crashed.
     */
    private async handleWorkerError(error: Error, threadId: number): Promise<void> {
        const job: ThreadJob<BaseWorkerData, unknown> | undefined = this.getJobByThreadId(threadId);
        if (!job) {
            return;
        }
        await this.updateThreadJobById(job.id, {
            stoppedAtMs: Date.now(),
            status: ThreadJobStatus.FAILED,
            error: error,
            threadId: undefined
        });
        await this.handleJobCompletion(job, threadId);
    }

    private async updateThreadJobById(id: string, data: Partial<ThreadJob<BaseWorkerData, unknown>>): Promise<void> {
        const existingJob: ThreadJob<BaseWorkerData, unknown> = this.queue[this.queue.findIndex(j => j.id === id)];
        this.queue[this.queue.findIndex(j => j.id === id)] = {
            ...existingJob,
            ...data
        };
        if (existingJob.type === 'job') {
            await this.threadJobEntityRepository.updateById(id, data);
        }
    }

    private isThreadJobMessage(value: unknown): value is ThreadJobMessage {
        return typeof value === 'object' && !!(value as ThreadJobMessage).type;
    }
}

const ONE_HOUR_IN_MS: number = 3600000;
const FIVE_MINUTES_IN_MS: number = 300000;

// eslint-disable-next-line jsdoc/require-jsdoc
function getDefaultTimeout(priority: boolean): number {
    return priority ? FIVE_MINUTES_IN_MS : ONE_HOUR_IN_MS;
}