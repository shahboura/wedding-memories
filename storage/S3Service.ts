import * as path from 'path';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { _Object as S3Object } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent as HttpsAgent } from 'https';
import {
  StorageService,
  UploadResult,
  VideoUploadData,
  PresignedUploadResponse,
  VideoMetadata,
} from './StorageService';
import type { MediaProps } from '../utils/types';

/**
 * S3/Wasabi implementation of the StorageService interface.
 *
 * Stores wedding photos in S3-compatible storage with organized folder structure:
 * - {guestName}/filename (guest-specific organization)
 */
export class S3Service implements StorageService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  /** Cache for presigned URLs with TTL to avoid regenerating per-request */
  private readonly presignedUrlCache = new Map<string, { url: string; expiresAt: number }>();
  /** Maximum age before refreshing a cached presigned URL (23 hours, expiry is 24h) */
  private static readonly PRESIGNED_URL_CACHE_TTL = 23 * 60 * 60 * 1000;
  /** Maximum number of cached presigned URLs to prevent unbounded memory growth */
  private static readonly MAX_CACHE_SIZE = 5000;

  constructor() {
    // Validate required environment variables
    const region = process.env.AWS_REGION;
    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET;

    if (!region || !bucket) {
      throw new Error(
        'AWS_REGION and NEXT_PUBLIC_S3_BUCKET environment variables are required for S3 storage'
      );
    }

    this.bucket = bucket;

    // Configure S3 client with optional custom endpoint for Wasabi
    const clientConfig: {
      region: string;
      credentials: {
        accessKeyId: string;
        secretAccessKey: string;
      };
      endpoint?: string;
      forcePathStyle?: boolean;
      maxAttempts?: number;
      requestHandler?: NodeHttpHandler;
    } = {
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      maxAttempts: 3,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,
        socketTimeout: 30000,
        httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 25 }),
      }),
    };

    // Add custom endpoint for Wasabi or other S3-compatible services
    if (process.env.NEXT_PUBLIC_S3_ENDPOINT) {
      clientConfig.endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT;
      clientConfig.forcePathStyle = true; // Required for some S3-compatible services
    }

    this.s3Client = new S3Client(clientConfig);
  }

  /**
   * Uploads a file to S3/Wasabi.
   *
   * @param file - The file to upload
   * @param guestName - Optional guest name for folder organization
   * @returns Promise that resolves to upload result with metadata
   */
  async upload(file: File, guestName?: string): Promise<UploadResult> {
    try {
      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Generate unique filename
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const fileExtension = path.extname(file.name).slice(1).toLowerCase() || 'jpg';
      const filename = `${timestamp}-${randomSuffix}.${fileExtension}`;

      // Sanitize guest name for consistency — fallback to 'unknown' to match Local storage
      const sanitizedGuestName = guestName ? this.sanitizeGuestName(guestName) : 'unknown';

      // Determine S3 key (path)
      const key = `${sanitizedGuestName}/${filename}`;

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        Metadata: {
          originalName: file.name,
          guestName: sanitizedGuestName || 'unknown',
          uploadDate: new Date().toISOString(),
        },
      });

      await this.s3Client.send(command);

      // Return upload result with metadata
      const fullUrl = await this.getPublicUrl(key);
      return {
        url: fullUrl,
        public_id: fullUrl, // Use presigned URL as public_id for frontend
        width: 720, // Default width for S3 images
        height: 480, // Default height for S3 images
        format: fileExtension,
        resource_type: file.type.startsWith('video/') ? 'video' : 'image',
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Failed to upload to S3:', error);
      throw new Error('Failed to upload photo to S3 storage');
    }
  }

  /**
   * Sanitize guest name for S3 path consistency
   */
  private sanitizeGuestName(guestName: string): string {
    return guestName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Lists all photos from S3/Wasabi with metadata.
   *
   * @param guestName - Optional guest name to filter photos
   * @returns Promise that resolves to an array of photo data with metadata
   */
  async list(guestName?: string): Promise<MediaProps[]> {
    try {
      // Sanitize guest name to match storage structure
      const sanitizedGuestName = guestName ? this.sanitizeGuestName(guestName) : undefined;

      // Determine prefix for listing
      const prefix = sanitizedGuestName ? `${sanitizedGuestName}/` : '';

      // Paginate through all S3 objects
      const allObjects: S3Object[] = [];
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: 1000,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        });

        const response = await this.s3Client.send(command);

        if (response.Contents) {
          allObjects.push(...response.Contents);
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);

      // Helper to determine resource type from file extension
      const getResourceType = (format: string): 'image' | 'video' => {
        const videoFormats = ['mp4', 'mov', 'avi', 'webm'];
        if (videoFormats.includes(format.toLowerCase())) return 'video';
        return 'image';
      };

      // Transform S3 objects to MediaProps format
      const mediaPromises = allObjects.map(async (object, index) => {
        if (!object.Key) return null;

        // Extract guest name from path
        const pathParts = object.Key.split('/');
        const extractedGuestName = pathParts.length > 1 ? pathParts[0] : 'Unknown Guest';

        // Extract filename and format
        const filename = pathParts[pathParts.length - 1];
        const format = path.extname(filename).slice(1).toLowerCase() || 'jpg';

        // Generate presigned URL for this object (uses cache internally)
        const presignedUrl = await this.getPublicUrl(object.Key);

        // Return media item with presigned URL
        return {
          id: index,
          height: 480,
          width: 720,
          public_id: presignedUrl, // Use presigned URL as public_id
          format: format,
          resource_type: getResourceType(format),
          guestName: guestName || extractedGuestName,
          uploadDate: object.LastModified?.toISOString(),
        };
      });

      const resolvedMediaItems = await Promise.all(mediaPromises);
      const mediaItems = resolvedMediaItems.filter(
        (item): item is NonNullable<typeof item> => item !== null
      );

      // Sort by upload date in descending order
      mediaItems.sort((a, b) => {
        const dateA = new Date(a.uploadDate || 0).getTime();
        const dateB = new Date(b.uploadDate || 0).getTime();
        return dateB - dateA;
      });

      return mediaItems;
    } catch (error) {
      console.error('Failed to list media from S3:', error);
      throw new Error('Failed to retrieve media from S3 storage');
    }
  }

  /**
   * Uploads a buffer directly to S3 with specified key and content type.
   * Used for video processing.
   *
   * @param buffer - Buffer to upload
   * @param key - S3 key (path)
   * @param contentType - MIME type of the content
   */
  async uploadFile(buffer: Buffer, key: string, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
  }

  /**
   * Generates a signed URL for private S3 objects.
   * Used for media file access.
   *
   * @param key - S3 object key
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns Signed URL
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Gets metadata for an S3 object.
   * Used to check if files exist.
   *
   * @param key - S3 object key
   * @returns Object metadata
   */
  async getFileMetadata(key: string): Promise<{
    ContentLength?: number;
    ContentType?: string;
    LastModified?: Date;
    ETag?: string;
  } | null> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await this.s3Client.send(command);
  }

  /**
   * Uploads a video file to S3 with metadata.
   */
  async uploadVideo(buffer: Buffer, options: VideoUploadData): Promise<UploadResult> {
    const { fileName, guestName, videoId, fileType } = options;
    const sanitizedGuestName = this.sanitizeGuestName(guestName);
    const fileExtension = path.extname(fileName).slice(1).toLowerCase() || 'mp4';
    const key = `${sanitizedGuestName}/videos/${videoId}.${fileExtension}`;

    // Upload with basic metadata
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: fileType || 'video/mp4',
      Metadata: {
        originalFilename: fileName,
        guestName: sanitizedGuestName,
        videoId: videoId,
        uploadDate: new Date().toISOString(),
      },
    });

    await this.s3Client.send(command);

    // Return presigned URL as public_id, consistent with upload() and list()
    const publicUrl = await this.getPublicUrl(key);
    return {
      url: publicUrl,
      public_id: publicUrl,
      width: 720, // Will be updated when metadata is available
      height: 480, // Will be updated when metadata is available
      format: fileExtension,
      resource_type: 'video',
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Generates a presigned URL for direct video upload.
   */
  async generateVideoUploadUrl(options: VideoUploadData): Promise<PresignedUploadResponse> {
    const { guestName, videoId, fileType, fileName } = options;
    const sanitizedGuestName = this.sanitizeGuestName(guestName);

    // Use the actual file extension instead of hardcoding .mp4
    const fileExtension = path.extname(fileName).slice(1).toLowerCase() || 'mp4';
    const key = `${sanitizedGuestName}/videos/${videoId}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: fileType || 'video/mp4',
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 }); // 1 hour
    const publicUrl = await this.getPublicUrl(key);

    return {
      uploadUrl,
      publicUrl,
    };
  }

  /**
   * Gets video metadata from S3 object.
   */
  async getVideoMetadata(publicUrl: string): Promise<VideoMetadata> {
    try {
      // Extract S3 key from public URL
      const urlParts = publicUrl.split('/');
      const bucketIndex = urlParts.findIndex((part) => part === this.bucket);
      const key = urlParts.slice(bucketIndex + 1).join('/');

      // Get object metadata from S3
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      // Parse metadata from S3 object metadata or use defaults
      const width = response.Metadata?.width ? parseInt(response.Metadata.width) : 720;
      const height = response.Metadata?.height ? parseInt(response.Metadata.height) : 480;
      const duration = response.Metadata?.duration
        ? parseFloat(response.Metadata.duration)
        : undefined;
      const format = path.extname(key).slice(1).toLowerCase() || 'mp4';

      return {
        width,
        height,
        duration,
        format,
      };
    } catch (error) {
      console.error('Error getting video metadata:', error);
      // Return defaults if metadata extraction fails
      return {
        width: 720,
        height: 480,
        format: 'mp4',
        duration: undefined,
      };
    }
  }

  private async getPublicUrl(key: string): Promise<string> {
    // Check cache first
    const cached = this.presignedUrlCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    // Generate presigned read URL for S3 objects (24 hour expiry)
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 86400 }); // 24 hours

      // Cache the URL, evicting oldest entry if at capacity
      if (this.presignedUrlCache.size >= S3Service.MAX_CACHE_SIZE) {
        // Evict the entry with the earliest expiration
        let oldestKey: string | undefined;
        let oldestExpiry = Infinity;
        const entries = Array.from(this.presignedUrlCache.entries());
        for (const [k, v] of entries) {
          if (v.expiresAt < oldestExpiry) {
            oldestExpiry = v.expiresAt;
            oldestKey = k;
          }
        }
        if (oldestKey) {
          this.presignedUrlCache.delete(oldestKey);
        }
      }

      this.presignedUrlCache.set(key, {
        url: presignedUrl,
        expiresAt: Date.now() + S3Service.PRESIGNED_URL_CACHE_TTL,
      });

      return presignedUrl;
    } catch (error) {
      console.error('Error generating presigned read URL:', error);
      // Fallback to direct URL if presigned URL generation fails
      const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT;

      if (endpoint) {
        const baseUrl = endpoint.replace(/\/$/, '');
        return `${baseUrl}/${this.bucket}/${key}`;
      } else {
        const region = process.env.AWS_REGION;
        return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
      }
    }
  }
}
