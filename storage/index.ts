import { StorageService } from './StorageService';
import { LocalStorageService } from './LocalStorageService';

/**
 * Creates and returns the appropriate storage service instance
 * based on the configured storage provider.
 */
function createStorageService(): StorageService {
  return new LocalStorageService();
}

/**
 * Singleton storage service instance.
 *
 * This is the main export that should be used throughout the application
 * for all storage operations. It automatically selects the correct
 * storage provider based on the app configuration.
 */
export const storage = createStorageService();
