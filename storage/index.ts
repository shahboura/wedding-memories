import { appConfig, StorageProvider } from '../config';
import { StorageService } from './StorageService';
import { CloudinaryService } from './CloudinaryService';
import { S3Service } from './S3Service';
import { LocalStorageService } from './LocalStorageService';

/**
 * Creates and returns the appropriate storage service instance
 * based on the configured storage provider.
 */
function createStorageService(): StorageService {
  switch (appConfig.storage) {
    case StorageProvider.Cloudinary:
      return new CloudinaryService();

    case StorageProvider.S3:
      return new S3Service();

    case StorageProvider.Local:
      return new LocalStorageService();

    default:
      throw new Error(`Unsupported storage provider: ${appConfig.storage}`);
  }
}

/**
 * Singleton storage service instance.
 *
 * This is the main export that should be used throughout the application
 * for all storage operations. It automatically selects the correct
 * storage provider based on the app configuration.
 */
export const storage = createStorageService();
