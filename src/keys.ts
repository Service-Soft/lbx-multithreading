/* eslint-disable jsdoc/require-jsdoc */
import { BindingKey, CoreBindings } from '@loopback/core';

import { LbxMultithreadingComponent } from './component';
import { ThreadJobService } from './services';

/**
 * Binding keys used by the lbx-multithreading library.
 */
// eslint-disable-next-line typescript/no-namespace
export namespace LbxMultithreadingBindings {
    export const COMPONENT: BindingKey<LbxMultithreadingComponent> = BindingKey.create(
        `${CoreBindings.COMPONENTS}.LbxMultithreadingComponent`
    );
    /**
     * The key of the datasource.
     */
    export const DATASOURCE_KEY: string = 'datasources.db';
    /**
     * The key of the repository responsible for the thread job entities.
     */
    export const THREAD_JOB_ENTITY_REPOSITORY: string = 'repositories.ThreadJobEntityRepository';
    /**
     * The key of the service responsible for handling thread jobs.
     */
    export const THREAD_JOB_SERVICE: BindingKey<ThreadJobService> = BindingKey.create(`${COMPONENT}.threadJobService`);
    /**
     * The number of threads that can be used.
     * Please notice that there is also **MAX_PRIORITY_THREADS** for the number of threads that should be reserved for priority jobs.
     * Both these values added up need to be smaller than your current machines available threads.
     * @default os.availableParallelism() - 1 (the -1 is reserved for a priority thread)
     */
    export const MAX_THREADS: BindingKey<number> = BindingKey.create(`${COMPONENT}.maxThreads`);
    /**
     * The number of threads that can be used by priority jobs.
     * Please notice that there is also **MAX_THREADS** for the number of threads that can be used by normal and priority jobs.
     * Both these values added up need to be smaller than your current machines available threads.
     * @default 1
     */
    export const MAX_PRIORITY_THREADS: BindingKey<number> = BindingKey.create(`${COMPONENT}.maxPriorityThreads`);
}