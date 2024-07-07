import { inject } from '@loopback/core';
import { DefaultCrudRepository, juggler } from '@loopback/repository';

import { LbxMultithreadingBindings } from '../keys';
import { BaseWorkerData, ThreadJobEntity, ThreadJobEntityRelations } from '../models';

export class ThreadJobEntityRepository extends DefaultCrudRepository<
    ThreadJobEntity<BaseWorkerData, unknown>,
    typeof ThreadJobEntity.prototype.id,
    ThreadJobEntityRelations
> {
    constructor(@inject(LbxMultithreadingBindings.DATASOURCE_KEY) dataSource: juggler.DataSource) {
        super(ThreadJobEntity, dataSource);
    }
}