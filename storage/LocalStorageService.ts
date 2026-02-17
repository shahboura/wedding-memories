import * as fs from 'fs/promises';
import * as path from 'path';
import {
  StorageService,
  UploadResult,
  VideoUploadData,
  PresignedUploadResponse,
  VideoMetadata,
} from './StorageService';
import type { MediaProps } from '../utils/types';

/**
 * Local filesystem implementation of the StorageService interface.
 *
 * Stores wedding photos/videos on a local directory (typically a Docker
 * mounted volume). Ideal for self-hosted / offline / development usage
 * where no cloud credentials are needed.
 *
 * Directory structure:
 *   {basePath}/
 *     {guestName}/
 *       {timestamp}-{random}.{ext}
 *       videos/
 *         {videoId}.{ext}
 */
export class LocalStorageService implements StorageService {
  private readonly basePath: string;

  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH || '/app/uploads';
  }

  /**
   * Ensures a directory exists, creating it recursively if needed.
   */
  private async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Sanitizes a guest name for safe use as a directory name.
   */
  private sanitizeGuestName(guestName: string): string {
    return guestName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Builds the API URL that serves a local file.
   * Files are served via /api/media/[...path] route.
   */
  private getMediaUrl(relativePath: string): string {
    return `/api/media/${relativePath}`;
  }

  /**
   * Determines resource type from file extension.
   */
  private getResourceType(format: string): 'image' | 'video' {
    const videoFormats = ['mp4', 'mov', 'avi', 'webm', 'mkv'];
    return videoFormats.includes(format.toLowerCase()) ? 'video' : 'image';
  }

  async upload(file: File, guestName?: string): Promise<UploadResult> {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const fileExtension = path.extname(file.name).slice(1).toLowerCase() || 'jpg';
    const filename = `${timestamp}-${randomSuffix}.${fileExtension}`;

    const sanitizedGuestName = guestName ? this.sanitizeGuestName(guestName) : 'unknown';
    const relativeDir = sanitizedGuestName;
    const relativePath = `${relativeDir}/${filename}`;
    const absoluteDir = path.join(this.basePath, relativeDir);
    const absolutePath = path.join(this.basePath, relativePath);

    await this.ensureDir(absoluteDir);

    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(absolutePath, Buffer.from(arrayBuffer));

    const mediaUrl = this.getMediaUrl(relativePath);

    return {
      url: mediaUrl,
      public_id: mediaUrl,
      width: 720,
      height: 480,
      format: fileExtension,
      resource_type: file.type.startsWith('video/') ? 'video' : 'image',
      created_at: new Date().toISOString(),
    };
  }

  async list(guestName?: string): Promise<MediaProps[]> {
    const sanitizedGuestName = guestName ? this.sanitizeGuestName(guestName) : undefined;
    const searchDir = sanitizedGuestName
      ? path.join(this.basePath, sanitizedGuestName)
      : this.basePath;

    // Ensure the base directory exists
    await this.ensureDir(this.basePath);

    const mediaItems: MediaProps[] = [];
    const idCounter = 0;

    try {
      await this.walkDirectory(searchDir, this.basePath, mediaItems, idCounter);
    } catch (error) {
      // Directory doesn't exist yet — return empty
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    // Sort newest first
    mediaItems.sort((a, b) => {
      const dateA = new Date(a.uploadDate || 0).getTime();
      const dateB = new Date(b.uploadDate || 0).getTime();
      return dateB - dateA;
    });

    // Reassign sequential IDs after sorting
    mediaItems.forEach((item, index) => {
      item.id = index;
    });

    return mediaItems;
  }

  /**
   * Recursively walks a directory tree, collecting media files.
   */
  private async walkDirectory(
    dirPath: string,
    basePath: string,
    items: MediaProps[],
    startId: number
  ): Promise<number> {
    let id = startId;

    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return id;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        id = await this.walkDirectory(fullPath, basePath, items, id);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        const mediaExtensions = [
          'jpg',
          'jpeg',
          'png',
          'gif',
          'webp',
          'avif',
          'mp4',
          'mov',
          'avi',
          'webm',
        ];

        if (!mediaExtensions.includes(ext)) continue;

        const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
        const pathParts = relativePath.split('/');
        const extractedGuestName = pathParts.length > 1 ? pathParts[0] : 'Unknown Guest';

        let stat;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }

        items.push({
          id: id++,
          height: 480,
          width: 720,
          public_id: this.getMediaUrl(relativePath),
          format: ext,
          resource_type: this.getResourceType(ext),
          guestName: extractedGuestName,
          uploadDate: stat.mtime.toISOString(),
        });
      }
    }

    return id;
  }

  async uploadVideo(buffer: Buffer, options: VideoUploadData): Promise<UploadResult> {
    const sanitizedGuestName = this.sanitizeGuestName(options.guestName);
    const fileExtension = path.extname(options.fileName).slice(1).toLowerCase() || 'mp4';
    const relativeDir = `${sanitizedGuestName}/videos`;
    const relativePath = `${relativeDir}/${options.videoId}.${fileExtension}`;
    const absoluteDir = path.join(this.basePath, relativeDir);
    const absolutePath = path.join(this.basePath, relativePath);

    await this.ensureDir(absoluteDir);
    await fs.writeFile(absolutePath, buffer);

    const mediaUrl = this.getMediaUrl(relativePath);

    return {
      url: mediaUrl,
      public_id: mediaUrl,
      width: 720,
      height: 480,
      format: fileExtension,
      resource_type: 'video',
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Local storage doesn't use presigned URLs.
   * Returns a direct upload URL to the Next.js upload endpoint.
   */
  async generateVideoUploadUrl(_options: VideoUploadData): Promise<PresignedUploadResponse> {
    throw new Error(
      'Local storage does not support presigned URLs. Videos are uploaded directly through the server.'
    );
  }

  async getVideoMetadata(publicUrl: string): Promise<VideoMetadata> {
    try {
      // Extract relative path from /api/media/... URL
      const relativePath = publicUrl.replace(/^\/api\/media\//, '');
      const absolutePath = path.join(this.basePath, relativePath);

      // Security: prevent path traversal — ensure resolved path stays within basePath
      const resolvedBase = path.resolve(this.basePath);
      const resolvedFile = path.resolve(absolutePath);
      if (!resolvedFile.startsWith(resolvedBase)) {
        throw new Error('Invalid path: traversal detected');
      }

      // Verify the file exists
      await fs.stat(resolvedFile);
      const ext = path.extname(resolvedFile).slice(1).toLowerCase() || 'mp4';

      return {
        width: 720,
        height: 480,
        format: ext,
        duration: undefined,
      };
    } catch {
      return {
        width: 720,
        height: 480,
        format: 'mp4',
        duration: undefined,
      };
    }
  }
}
