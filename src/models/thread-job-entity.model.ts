import { Entity, model, property } from '@loopback/repository';

import { BaseWorkerData } from './base-worker-data.model';
import { PercentNumber } from './thread-job-message.model';
import { ThreadJob, ThreadJobStatus } from './thread-job.model';

const omitValues: (keyof ThreadJob<BaseWorkerData, unknown>)[] = ['onCancel', 'onComplete', 'onError', 'onMessage', 'completedSubject'];
// eslint-disable-next-line jsdoc/require-jsdoc
type OmitValues = typeof omitValues[number];

/**
 * Contains information about an invoice.
 */
@model()
export class ThreadJobEntity<WorkerData extends BaseWorkerData, ResultType>
    extends Entity
    implements Omit<ThreadJob<WorkerData, ResultType>, OmitValues> {

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'string',
        id: true,
        defaultFn: 'uuidv4'
    })
    id!: string;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'number',
        required: true,
        dataType: 'bigint'
    })
    queuedAtMs!: number;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'number',
        required: false,
        dataType: 'bigint'
    })
    startedAtMs?: number;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'number',
        required: false,
        dataType: 'bigint'
    })
    stoppedAtMs?: number;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'string',
        required: true,
        jsonSchema: {
            enum: Object.values(ThreadJobStatus)
        }
    })
    status!: ThreadJobStatus;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'number',
        required: false
    })
    threadId?: number;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'number',
        required: true
    })
    progress!: PercentNumber;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'boolean',
        required: true
    })
    priority!: boolean;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'number',
        required: true
    })
    timeout!: number;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'any',
        required: false
    })
    error?: Error;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'any',
        required: true
    })
    workerData!: WorkerData;

    // eslint-disable-next-line jsdoc/require-jsdoc
    @property({
        type: 'any',
        required: false
    })
    result?: ResultType;

    constructor(data?: Partial<ThreadJobEntity<WorkerData, ResultType>>) {
        super(data);
    }
}

/**
 * All relations of a thread job entity.
 */
export interface ThreadJobEntityRelations {
    // describe navigational properties here
}

/**
 * The thread job entity with all its relations.
 */
// eslint-disable-next-line stylistic/max-len
export type ThreadJobEntityWithRelations<WorkerData extends BaseWorkerData, ResultType> = ThreadJobEntity<WorkerData, ResultType> & ThreadJobEntityRelations;