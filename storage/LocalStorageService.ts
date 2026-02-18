import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { StorageService, UploadMetadata, UploadResult, UploadSource } from './StorageService';
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

  private getMetaPath(absoluteDir: string, baseName: string): string {
    return path.join(absoluteDir, 'meta', `${baseName}.json`);
  }

  private async generateImageAssets(
    buffer: Buffer,
    absoluteDir: string,
    baseName: string
  ): Promise<{ width: number; height: number; blurDataUrl: string }> {
    const image = sharp(buffer).rotate();
    const metadata = await image.metadata();
    const width = metadata.width ?? 720;
    const height = metadata.height ?? 480;

    const thumbDir = path.join(absoluteDir, 'thumb');
    const mediumDir = path.join(absoluteDir, 'medium');
    await Promise.all([this.ensureDir(thumbDir), this.ensureDir(mediumDir)]);

    await Promise.all([
      image
        .clone()
        .resize({ width: 400, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(path.join(thumbDir, `${baseName}.webp`)),
      image
        .clone()
        .resize({ width: 1080, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(mediumDir, `${baseName}.webp`)),
    ]);

    const blurBuffer = await image.clone().resize(8).jpeg({ quality: 60 }).toBuffer();
    const blurDataUrl = `data:image/jpeg;base64,${blurBuffer.toString('base64')}`;

    return { width, height, blurDataUrl };
  }

  /**
   * Determines resource type from file extension.
   */
  private getResourceType(format: string): 'image' | 'video' {
    const videoFormats = ['mp4', 'mov', 'avi', 'webm', 'mkv'];
    return videoFormats.includes(format.toLowerCase()) ? 'video' : 'image';
  }

  async upload(file: File, guestName?: string, metadata?: UploadMetadata): Promise<UploadResult> {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const fileExtension = path.extname(file.name).slice(1).toLowerCase() || 'jpg';
    const baseName = `${timestamp}-${randomSuffix}`;
    const filename = `${baseName}.${fileExtension}`;

    const sanitizedGuestName = guestName ? this.sanitizeGuestName(guestName) : 'unknown';
    const relativeDir = sanitizedGuestName;
    const relativePath = `${relativeDir}/${filename}`;
    const absoluteDir = path.join(this.basePath, relativeDir);
    const absolutePath = path.join(this.basePath, relativePath);

    await this.ensureDir(absoluteDir);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(absolutePath, buffer);

    let width = metadata?.width ?? 720;
    let height = metadata?.height ?? 480;
    let blurDataUrl = '';
    if (file.type.startsWith('image/')) {
      const result = await this.generateImageAssets(buffer, absoluteDir, baseName);
      width = result.width;
      height = result.height;
      blurDataUrl = result.blurDataUrl;
    }

    const metaPath = this.getMetaPath(absoluteDir, baseName);
    await this.ensureDir(path.dirname(metaPath));
    await fs.writeFile(
      metaPath,
      JSON.stringify({ width, height, blurDataUrl, format: fileExtension }, null, 2)
    );

    const mediaUrl = this.getMediaUrl(relativePath);

    return {
      url: mediaUrl,
      public_id: mediaUrl,
      width,
      height,
      format: fileExtension,
      resource_type: file.type.startsWith('video/') ? 'video' : 'image',
      created_at: new Date().toISOString(),
    };
  }

  async uploadFromPath(
    source: UploadSource,
    guestName?: string,
    metadata?: UploadMetadata
  ): Promise<UploadResult> {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const fileExtension =
      path.extname(source.originalName).slice(1).toLowerCase() ||
      path.extname(source.tempPath).slice(1).toLowerCase() ||
      'jpg';
    const baseName = `${timestamp}-${randomSuffix}`;
    const filename = `${baseName}.${fileExtension}`;

    const sanitizedGuestName = guestName ? this.sanitizeGuestName(guestName) : 'unknown';
    const relativeDir = sanitizedGuestName;
    const relativePath = `${relativeDir}/${filename}`;
    const absoluteDir = path.join(this.basePath, relativeDir);
    const absolutePath = path.join(this.basePath, relativePath);

    await this.ensureDir(absoluteDir);
    await fs.copyFile(source.tempPath, absolutePath);

    let width = metadata?.width ?? 720;
    let height = metadata?.height ?? 480;
    let blurDataUrl = '';

    if (source.mimeType.startsWith('image/')) {
      const buffer = await fs.readFile(absolutePath);
      const result = await this.generateImageAssets(buffer, absoluteDir, baseName);
      width = result.width;
      height = result.height;
      blurDataUrl = result.blurDataUrl;
    }

    const metaPath = this.getMetaPath(absoluteDir, baseName);
    await this.ensureDir(path.dirname(metaPath));
    await fs.writeFile(
      metaPath,
      JSON.stringify({ width, height, blurDataUrl, format: fileExtension }, null, 2)
    );

    const mediaUrl = this.getMediaUrl(relativePath);

    return {
      url: mediaUrl,
      public_id: mediaUrl,
      width,
      height,
      format: fileExtension,
      resource_type: source.mimeType.startsWith('video/') ? 'video' : 'image',
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
        const normalizedPath = relativePath.toLowerCase();
        if (
          normalizedPath.includes('/thumb/') ||
          normalizedPath.includes('/medium/') ||
          normalizedPath.includes('/meta/')
        ) {
          continue;
        }
        const extractedGuestName = pathParts.length > 1 ? pathParts[0] : 'Unknown Guest';

        let stat;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }

        let width = 720;
        let height = 480;
        let blurDataUrl: string | undefined;
        if (this.getResourceType(ext) === 'image') {
          const baseName = path.basename(fullPath, path.extname(fullPath));
          const metaPath = this.getMetaPath(path.dirname(fullPath), baseName);
          try {
            const metaRaw = await fs.readFile(metaPath, 'utf-8');
            const meta = JSON.parse(metaRaw) as {
              width?: number;
              height?: number;
              blurDataUrl?: string;
            };
            if (meta.width) width = meta.width;
            if (meta.height) height = meta.height;
            if (meta.blurDataUrl) blurDataUrl = meta.blurDataUrl;
          } catch {
            // Missing metadata — keep defaults
          }
        }

        items.push({
          id: id++,
          height,
          width,
          public_id: this.getMediaUrl(relativePath),
          format: ext,
          resource_type: this.getResourceType(ext),
          guestName: extractedGuestName,
          uploadDate: stat.mtime.toISOString(),
          ...(blurDataUrl ? { blurDataUrl } : {}),
        });
      }
    }

    return id;
  }
}
