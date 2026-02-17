/**
 * Core media data structure for the wedding gallery application.
 * Represents a photo or video with metadata from the storage provider and guest information.
 */
export interface MediaProps {
  /** Unique identifier for the media in the gallery */
  id: number;
  /** Media height in pixels */
  height: number;
  /** Media width in pixels */
  width: number;
  /** Cloudinary public ID for the media */
  public_id: string;
  /** Media file format (jpg, mp4, etc.) */
  format: string;
  /** Type of media resource */
  resource_type: 'image' | 'video';
  /** Base64 blur placeholder for loading states (images only) */
  blurDataUrl?: string;
  /** Name of the guest who uploaded the media */
  guestName?: string;
  /** ISO date string when the media was uploaded */
  uploadDate?: string;
  /** Unique video ID (videos only) */
  videoId?: string;
  /** Video duration in seconds (videos only) */
  duration?: number;
}

/**
 * Upload file status during the upload process.
 */
export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

/**
 * File data structure during the upload process.
 */
export interface UploadFile {
  /** The actual file object */
  file: File;
  /** Unique identifier for this upload */
  id: string;
  /** Upload progress percentage (0-100) */
  progress: number;
  /** Current status of the upload */
  status: UploadStatus;
  /** Error message if upload failed */
  error?: string;
  /** Base64 thumbnail for preview */
  thumbnail?: string;
  /** File hash for duplicate detection */
  hash?: string;
}

/**
 * Error response from API endpoints.
 */
export interface ApiErrorResponse {
  error: string;
  details?: string;
}
