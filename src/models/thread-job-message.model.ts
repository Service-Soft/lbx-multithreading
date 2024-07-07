import { ThreadJobStatus } from './thread-job.model';

// eslint-disable-next-line jsdoc/require-jsdoc
type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
    ? Acc[number]
    : Enumerate<N, [...Acc, Acc['length']]>;

// eslint-disable-next-line jsdoc/require-jsdoc
type IntRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>;

/**
 * A number from 0 to 100.
 */
export type PercentNumber = IntRange<0, 101>;

/**
 * The internal thread job message types.
 */
export type ThreadJobMessage<T = unknown> = StatusMessage | ProgressMessage | CompletionMessage<T> | InitializationMessage | ErrorMessage;

/**
 * The message that is sent once on initialization.
 */
type InitializationMessage = {
    /**
     * The type of the message.
     */
    type: 'initialization'
};

/**
 * A message to change the status of the thread job.
 */
type StatusMessage = {
    /**
     * The type of the message.
     */
    type: 'status',
    /**
     * The status that should be set.
     */
    status: ThreadJobStatus
};

/**
 * A message to indicate that the thread job has failed.
 */
type ErrorMessage<ErrorType extends Error = Error> = {
    /**
     * The type of the message.
     */
    type: 'error',
    /**
     * The error that the thread job failed with.
     */
    error: ErrorType
};

/**
 * A message to update the progress of the job.
 */
type ProgressMessage = {
    /**
     * The type of the message.
     */
    type: 'progress',
    /**
     * The progress as a percentage number.
     * Cannot be set to 100 as the CompletionMessage should be used for that.
     */
    progress: PercentNumber
};

/**
 * A message to indicate that the thread job was completed successfully.
 */
type CompletionMessage<T> = {
    /**
     * The type of the message.
     */
    type: 'completion',
    /**
     * The result of the thread job.
     */
    result: T
};