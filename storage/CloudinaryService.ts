import { v2 as cloudinary } from 'cloudinary';
import generateBlurPlaceholder from '../utils/generateBlurPlaceholder';
import {
  StorageService,
  UploadResult,
  VideoUploadData,
  PresignedUploadResponse,
  VideoMetadata,
} from './StorageService';
import type { MediaProps } from '../utils/types';

interface CloudinaryResource {
  public_id: string;
  height?: number;
  width?: number;
  format: string;
  resource_type: string;
  created_at: string;
  context?: {
    guest?: string;
  };
}

/**
 * Cloudinary implementation of the StorageService interface.
 *
 * Stores wedding photos in Cloudinary with organized folder structure:
 * - wedding/ (base folder)
 * - wedding/{guestName}/ (when guest isolation is used)
 */
export class CloudinaryService implements StorageService {
  private readonly baseFolder = 'wedding';

  constructor() {
    cloudinary.config({
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * Sanitizes a guest name for safe use in Cloudinary folder paths and search expressions.
   * Matches the sanitization used by S3Service and LocalStorageService.
   */
  private sanitizeGuestName(guestName: string): string {
    return guestName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Uploads a file to Cloudinary with guest-specific folder organization.
   *
   * @param file - The file to upload
   * @param guestName - Optional guest name for folder organization
   * @returns Promise that resolves to upload result with metadata
   */
  async upload(file: File, guestName?: string): Promise<UploadResult> {
    try {
      // Convert file to base64 data URI
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataURI = `data:${file.type};base64,${base64}`;

      // Always create guest-specific folders when guest name is provided
      const sanitizedGuestName = guestName ? this.sanitizeGuestName(guestName) : undefined;
      const folder = sanitizedGuestName
        ? `${this.baseFolder}/${sanitizedGuestName}`
        : this.baseFolder;

      // Upload to Cloudinary with both folder structure AND context
      const result = await cloudinary.uploader.upload(dataURI, {
        folder,
        context: guestName ? { guest: guestName } : undefined,
        resource_type: file.type.startsWith('video/') ? 'video' : 'image',
        quality: 'auto:good',
        fetch_format: 'auto',
      });

      return {
        url: result.secure_url,
        public_id: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        resource_type: file.type.startsWith('video/') ? 'video' : 'image',
        created_at: result.created_at,
      };
    } catch (error) {
      console.error('Failed to upload to Cloudinary:', error);
      throw new Error('Failed to upload photo to Cloudinary');
    }
  }

  /**
   * Lists all photos from Cloudinary with metadata.
   *
   * @param guestName - Optional guest name to filter photos
   * @returns Promise that resolves to an array of photo data with metadata
   */
  async list(guestName?: string): Promise<MediaProps[]> {
    try {
      // Build search expression based on guest filtering
      let expression = `folder:${this.baseFolder}/*`;
      if (guestName) {
        // Sanitize guest name before using in search expression
        const sanitizedGuestName = this.sanitizeGuestName(guestName);
        expression = `folder:${this.baseFolder}/${sanitizedGuestName}/*`;
      }

      // Search for images with context
      const searchResults = await cloudinary.search
        .expression(expression)
        .sort_by('created_at', 'desc')
        .max_results(400)
        .with_field('context')
        .execute();

      // Transform to ImageProps format
      const transformedMedia: MediaProps[] = searchResults.resources.map(
        (resource: CloudinaryResource, index: number) => {
          return {
            id: index,
            height: resource.height?.toString() || '480',
            width: resource.width?.toString() || '720',
            public_id: resource.public_id,
            format: resource.format,
            resource_type: resource.resource_type, // Add resource_type
            guestName: resource.context?.guest || guestName || 'Unknown Guest',
            uploadDate: resource.created_at,
          };
        }
      );

      // Generate blur placeholders
      const blurPlaceholderPromises = transformedMedia.map((mediaItem) => {
        // Only generate blur for images
        if (mediaItem.resource_type === 'image') {
          // Find the original resource for this image
          const originalResource = searchResults.resources.find(
            (resource: CloudinaryResource) => resource.public_id === mediaItem.public_id
          );
          return generateBlurPlaceholder(originalResource);
        }
        return Promise.resolve(undefined); // Return undefined for videos
      });

      const blurPlaceholders = await Promise.all(blurPlaceholderPromises);

      // Add blur placeholders to images
      transformedMedia.forEach((mediaItem, index) => {
        if (mediaItem.resource_type === 'image') {
          mediaItem.blurDataUrl = blurPlaceholders[index];
        }
      });

      return transformedMedia;
    } catch (error) {
      console.error('Failed to list photos from Cloudinary:', error);
      throw new Error('Failed to retrieve photos from Cloudinary');
    }
  }

  /**
   * Uploads a video file to Cloudinary.
   * Note: Cloudinary imposes a hard 100MB limit on video uploads regardless of our
   * server-side MAX_VIDEO_SIZE (500MB). Users needing larger videos should use S3/Local storage.
   */
  async uploadVideo(buffer: Buffer, options: VideoUploadData): Promise<UploadResult> {
    const CLOUDINARY_VIDEO_LIMIT = 100 * 1024 * 1024; // Cloudinary's hard 100MB limit

    if (options.fileSize > CLOUDINARY_VIDEO_LIMIT) {
      throw new Error(
        `Video file size (${Math.round(options.fileSize / 1024 / 1024)}MB) exceeds Cloudinary's 100MB limit. Please use a smaller file or switch to S3 storage.`
      );
    }

    try {
      const sanitizedGuestName = this.sanitizeGuestName(options.guestName);
      // Use path-based naming consistent with S3/Local: {baseFolder}/{guest}/videos/{videoId}
      const folder = `${this.baseFolder}/${sanitizedGuestName}/videos`;
      const result = await cloudinary.uploader.upload(
        `data:${options.fileType};base64,${buffer.toString('base64')}`,
        {
          resource_type: 'video',
          folder,
          // Store raw (unsanitized) guest name in context for display, matching image upload behavior
          context: options.guestName ? { guest: options.guestName } : undefined,
          public_id: options.videoId,
        }
      );

      return {
        url: result.secure_url,
        public_id: result.public_id,
        width: result.width || 720,
        height: result.height || 480,
        format: result.format || 'mp4',
        resource_type: 'video',
        created_at: result.created_at,
        duration: result.duration,
      };
    } catch (error) {
      console.error('Failed to upload video to Cloudinary:', error);
      throw new Error('Failed to upload video to Cloudinary');
    }
  }

  /**
   * Cloudinary doesn't support presigned URLs like S3.
   * This method throws an error to indicate videos should be uploaded via uploadVideo method.
   */
  async generateVideoUploadUrl(_options: VideoUploadData): Promise<PresignedUploadResponse> {
    throw new Error(
      'Cloudinary does not support presigned URLs. Use direct upload via uploadVideo method instead, or switch to S3 storage for presigned URL uploads.'
    );
  }

  /**
   * Gets video metadata from Cloudinary.
   */
  async getVideoMetadata(publicUrl: string): Promise<VideoMetadata> {
    try {
      // Extract public_id from Cloudinary URL
      const urlParts = publicUrl.split('/');
      const uploadIndex = urlParts.findIndex((part) => part === 'upload');
      const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
      const publicId = publicIdWithExt.split('.')[0];

      // Get resource info from Cloudinary
      const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });

      return {
        width: result.width,
        height: result.height,
        duration: result.duration,
        format: result.format,
      };
    } catch (error) {
      console.error('Error getting video metadata from Cloudinary:', error);
      // Return defaults if metadata extraction fails
      return {
        width: 720,
        height: 480,
        format: 'mp4',
        duration: undefined,
      };
    }
  }
}
