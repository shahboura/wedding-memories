import type { MediaProps } from '../utils/types';

/**
 * Upload result with metadata for immediate UI updates.
 */
export interface UploadResult {
  url: string;
  public_id: string;
  width: number;
  height: number;
  format: string;
  resource_type: 'image' | 'video';
  created_at: string;
}

export interface UploadMetadata {
  width?: number;
  height?: number;
}

export interface UploadSource {
  tempPath: string;
  originalName: string;
  mimeType: string;
  size: number;
}

/**
 * Storage service interface for wedding photo management.
 *
 * Provides a unified interface for storage providers
 * (local filesystem by default).
 */
export interface StorageService {
  /**
   * Uploads a file to the storage provider.
   *
   * @param file - The file to upload
   * @param guestName - Optional guest name for file organization
   * @returns Promise that resolves to upload result with metadata
   */
  upload(file: File, guestName?: string, metadata?: UploadMetadata): Promise<UploadResult>;

  /**
   * Uploads a local file (streamed) to the storage provider.
   *
   * @param source - Local file reference and metadata
   * @param guestName - Optional guest name for file organization
   * @param metadata - Optional media metadata (width/height)
   * @returns Promise that resolves to upload result with metadata
   */
  uploadFromPath(
    source: UploadSource,
    guestName?: string,
    metadata?: UploadMetadata
  ): Promise<UploadResult>;

  /**
   * Lists all photos from the storage provider with metadata.
   *
   * @param guestName - Optional guest name to filter photos
   * @returns Promise that resolves to an array of photo data with metadata
   */
  list(guestName?: string): Promise<MediaProps[]>;
}
