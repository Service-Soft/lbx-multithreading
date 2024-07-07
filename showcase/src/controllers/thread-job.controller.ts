import { get, getModelSchemaRef, param, post, requestBody } from '@loopback/rest';
import { BaseWorkerData, ThreadJobEntity, ThreadJobEntityRepository, ThreadJobService } from 'lbx-multithreading';
import { Model, model, property, repository } from '@loopback/repository';
import { service } from '@loopback/core';
import path from 'path';

const timeoutWorkerFilePath: string = path.join(__dirname, 'timeout.worker.ts');

@model()
class TimeoutJobInput extends Model {

    @property({
        type: 'number',
        required: true
    })
    timeout: number;

    constructor(data: Partial<TimeoutJobInput>) {
        super(data);
    }
}

export class TestController {

    constructor(
        @repository(ThreadJobEntityRepository)
        private readonly threadJobRepository: ThreadJobEntityRepository,
        @service(ThreadJobService)
        private readonly threadJobService: ThreadJobService
    ) {}

    @get('/thread-jobs', {
        responses: {
            '200': {
                content: {
                    'application/json': {
                        schema: {
                            type: 'array',
                            items: getModelSchemaRef(ThreadJobEntity)
                        }
                    }
                }
            }
        }
    })
    async find(): Promise<ThreadJobEntity<BaseWorkerData, unknown>[]> {
        return this.threadJobRepository.find();
    }

    @get('/thread-jobs/{id}', {
        responses: {
            '200': {
                content: {
                    'application/json': {
                        schema: getModelSchemaRef(ThreadJobEntity)
                    }
                }
            }
        }
    })
    async findDetails(
        @param.path.string('id')
        id: string
    ): Promise<ThreadJobEntity<BaseWorkerData, unknown>> {
        return this.threadJobRepository.findById(id);
    }

    @post('/thread-jobs/timeout', { responses: { '200': {} } })
    async create(
        @requestBody({
            content: {
                'application/json': {
                    schema: getModelSchemaRef(TimeoutJobInput)
                }
            }
        })
        input: TimeoutJobInput,
        @param.query.string('type', { required: false })
        type: 'job' | 'function' = 'function'
    ): Promise<void | string> {
        if (type === 'job') {
            return this.threadJobService.queueThreadJob({
                workerData: {
                    filePath: timeoutWorkerFilePath,
                    timeout: input.timeout
                }
            });
        }
        return this.threadJobService.run((timeout: number) => {
            return new Promise((resolve, reject) => {
                try {
                    setTimeout(() => resolve(), timeout);
                }
                catch (error) {
                    reject(error);
                }
            })
        }, input.timeout);
    }
}