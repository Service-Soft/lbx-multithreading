import { injectable, Component, ContextTags, Binding } from '@loopback/core';

import { LbxMultithreadingBindings } from './keys';
import { ThreadJobEntityRepository } from './repositories';
import { ThreadJobService } from './services';

/**
 * Configure the binding for LbxMultithreadingComponent.
 */
@injectable({ tags: { [ContextTags.KEY]: LbxMultithreadingBindings.COMPONENT } })
export class LbxMultithreadingComponent implements Component {

    // eslint-disable-next-line jsdoc/require-jsdoc
    bindings: Binding[] = [
        Binding.bind(LbxMultithreadingBindings.THREAD_JOB_ENTITY_REPOSITORY).toClass(ThreadJobEntityRepository),
        Binding.bind(LbxMultithreadingBindings.THREAD_JOB_SERVICE).toClass(ThreadJobService)
    ];

    constructor() {}
}