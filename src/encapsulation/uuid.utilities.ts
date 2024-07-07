import { v4 } from 'uuid';

/**
 * Encapsulates functionality of the uuid library.
 */
export abstract class UUIDUtilities {
    /**
     * Generates a uuid.
     * @returns A uuid v4.
     */
    static generate(): string {
        return v4();
    }
}