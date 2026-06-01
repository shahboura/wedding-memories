import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { StorageService, UploadMetadata, UploadResult, UploadSource } from './StorageService';
import type { MediaProps } from '../utils/types';

/**
 * Produces a stable positive integer from a string (djb2 hash).
 * Used to generate deterministic IDs from file paths so that IDs
 * don't shift when items are added or removed.
 */
function stableNumericHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // ensure unsigned 32-bit
}

/** File extensions recognized as uploadable/servable media. */
const MEDIA_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'mp4',
  'mov',
  'avi',
  'webm',
]);

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
  /** Prevents concurrent sharp runs for the same missing variant. */
  private readonly regenerationLocks = new Map<string, Promise<void>>();

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
    baseName: string,
    originalFormat?: string
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

    // Write meta JSON when the original format is known (always during upload,
    // optionally during on-demand regeneration).
    if (originalFormat) {
      const metaPath = this.getMetaPath(absoluteDir, baseName);
      await this.ensureDir(path.dirname(metaPath));
      await fs.writeFile(
        metaPath,
        JSON.stringify({ width, height, blurDataUrl, format: originalFormat }, null, 2)
      );
    }

    return { width, height, blurDataUrl };
  }

  /**
   * Ensures a thumb or medium image variant exists on disk, regenerating it
   * from the original file when missing.  Safe for concurrent requests —
   * only one sharp pass runs per file; other callers wait on the same promise.
   *
   * @returns The absolute path if the variant exists (or was regenerated),
   *          or `null` when the original file cannot be found.
   */
  async ensureImageVariant(absolutePath: string): Promise<string | null> {
    // Fast path — already on disk
    try {
      await fs.access(absolutePath);
      return absolutePath;
    } catch {
      // Not found — try regeneration below
    }

    // Only handle *.webp files inside a thumb/ or medium/ directory
    const variantDir = path.dirname(absolutePath);
    const variantType = path.basename(variantDir);
    if (variantType !== 'thumb' && variantType !== 'medium') return null;
    if (path.extname(absolutePath).toLowerCase() !== '.webp') return null;

    const baseName = path.basename(absolutePath, '.webp');
    const guestDir = path.dirname(variantDir);

    // Locate the original file (any common image extension)
    const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    let originalPath = '';
    let originalExt = '';
    for (const ext of IMAGE_EXTENSIONS) {
      const candidate = path.join(guestDir, `${baseName}.${ext}`);
      try {
        await fs.access(candidate);
        originalPath = candidate;
        originalExt = ext;
        break;
      } catch {
        // Try next extension
      }
    }
    if (!originalPath) return null;

    // Concurrency: if another request is already regenerating this file,
    // wait for it instead of starting a duplicate sharp pipeline.
    const lockKey = absolutePath;
    const inFlight = this.regenerationLocks.get(lockKey);
    if (inFlight) {
      await inFlight; // never rejects — errors are swallowed inside the lock
      try {
        await fs.access(absolutePath);
        return absolutePath;
      } catch {
        return null;
      }
    }

    const lockPromise = (async () => {
      try {
        const buffer = await fs.readFile(originalPath);
        // Reuses the same generateImageAssets pipeline as uploads — generates
        // both thumb + medium variants and the meta JSON in one pass.  More
        // than we strictly need for one missing variant, but the cost is
        // negligible (~50-200ms) and both variants are ready for future requests.
        await this.generateImageAssets(buffer, guestDir, baseName, originalExt);
      } catch {
        // Sharp may fail on corrupt images — leave no lock behind and let
        // the caller return 404.
      } finally {
        this.regenerationLocks.delete(lockKey);
      }
    })();

    this.regenerationLocks.set(lockKey, lockPromise);
    await lockPromise;

    try {
      await fs.access(absolutePath);
      return absolutePath;
    } catch {
      return null;
    }
  }

  /**
   * Determines resource type from file extension.
   */
  private getResourceType(format: string): 'image' | 'video' {
    const videoFormats = ['mp4', 'mov', 'avi', 'webm'];
    return videoFormats.includes(format.toLowerCase()) ? 'video' : 'image';
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
    const relativePath = `${sanitizedGuestName}/${filename}`;
    const absoluteDir = path.join(this.basePath, sanitizedGuestName);
    const absolutePath = path.join(this.basePath, relativePath);

    await this.ensureDir(absoluteDir);
    await fs.copyFile(source.tempPath, absolutePath);

    let width = metadata?.width ?? 720;
    let height = metadata?.height ?? 480;
    let blurDataUrl = '';

    if (source.mimeType.startsWith('image/')) {
      const buffer = await fs.readFile(absolutePath);
      const result = await this.generateImageAssets(buffer, absoluteDir, baseName, fileExtension);
      width = result.width;
      height = result.height;
      blurDataUrl = result.blurDataUrl;
    } else {
      // Videos — write a minimal meta file so walkDirectory() picks up dimensions
      const metaPath = this.getMetaPath(absoluteDir, baseName);
      await this.ensureDir(path.dirname(metaPath));
      await fs.writeFile(
        metaPath,
        JSON.stringify({ width, height, blurDataUrl, format: fileExtension }, null, 2)
      );
    }

    const mediaUrl = this.getMediaUrl(relativePath);

    return {
      url: mediaUrl,
      public_id: mediaUrl,
      width,
      height,
      format: fileExtension,
      resource_type: this.getResourceType(fileExtension),
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

    try {
      await this.walkDirectory(searchDir, this.basePath, mediaItems);
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

    // Assign stable IDs derived from each file's public_id (API URL path).
    // Unlike sequential indices, these don't shift when items are added/removed.
    mediaItems.forEach((item) => {
      item.id = stableNumericHash(item.public_id);
    });

    return mediaItems;
  }

  /**
   * Recursively walks a directory tree, collecting media files.
   */
  private async walkDirectory(
    dirPath: string,
    basePath: string,
    items: MediaProps[]
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, basePath, items);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (!MEDIA_EXTENSIONS.has(ext)) continue;

        const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
        const pathParts = relativePath.split('/');
        const normalizedPath = relativePath.toLowerCase();
        if (
          normalizedPath.includes('/thumb/') ||
          normalizedPath.includes('/medium/') ||
          normalizedPath.includes('/meta/') ||
          normalizedPath.includes('/@eadir/')
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
          id: 0, // Placeholder — reassigned after sorting in list()
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
  }
}
