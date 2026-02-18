import { LocalStorageService } from './LocalStorageService';

/**
 * Singleton storage service instance (local filesystem).
 *
 * This is the main export that should be used throughout the application
 * for all storage operations.
 */
export const storage = new LocalStorageService();
