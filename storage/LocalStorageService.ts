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
  /**
   * Short-lived negative cache keyed on the original file. Prevents repeated
   * sharp attempts and error-log spam when an original is missing or
   * unreadable. Values are the epoch-ms instant the entry expires.
   */
  private readonly failedRegenerations = new Map<string, number>();
  private static readonly REGENERATION_FAILURE_TTL_MS = 5 * 60 * 1000;

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

  /**
   * Confines a resolved path to the configured storage root.
   *
   * Uses `root + path.sep` so a sibling directory such as
   * `/app/uploads-old` cannot be mistaken for an in-root path.
   */
  private isInsideBasePath(absolutePath: string): boolean {
    const resolved = path.resolve(absolutePath);
    const root = path.resolve(this.basePath);
    return resolved === root || resolved.startsWith(root + path.sep);
  }

  /**
   * Resolves the original media file for a generated variant base name by
   * probing the common image extensions. Returns `null` when none exists.
   */
  private async findOriginalImage(guestDir: string, baseName: string): Promise<string | null> {
    const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    for (const ext of IMAGE_EXTENSIONS) {
      const candidate = path.join(/*turbopackIgnore: true*/ guestDir, `${baseName}.${ext}`);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next extension
      }
    }
    return null;
  }

  /**
   * Records a failed regeneration so subsequent requests short-circuit for
   * `REGENERATION_FAILURE_TTL_MS`. Expired entries are pruned opportunistically.
   */
  private rememberRegenerationFailure(lockKey: string): void {
    const now = Date.now();
    for (const [key, expiry] of this.failedRegenerations) {
      if (expiry <= now) this.failedRegenerations.delete(key);
    }
    this.failedRegenerations.set(lockKey, now + LocalStorageService.REGENERATION_FAILURE_TTL_MS);
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

    const metaPath = this.getMetaPath(absoluteDir, baseName);
    await this.ensureDir(path.dirname(metaPath));
    await fs.writeFile(
      metaPath,
      JSON.stringify({ width, height, blurDataUrl }, null, 2)
    );

    return { width, height, blurDataUrl };
  }

  /**
   * Ensures a thumb or medium image variant exists on disk, regenerating it
   * from the original file when missing.
   *
   * Concurrency: the lock is keyed on the ORIGINAL file, not the variant path,
   * so a concurrent thumb + medium request for the same image coalesces into a
   * single sharp pipeline instead of racing to write the same files.
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
    // Defense-in-depth: never read originals outside the storage root.
    if (!this.isInsideBasePath(absolutePath)) return null;

    const baseName = path.basename(absolutePath, '.webp');
    const guestDir = path.dirname(variantDir);

    const resolveVariant = async (): Promise<string | null> => {
      try {
        await fs.access(absolutePath);
        return absolutePath;
      } catch {
        return null;
      }
    };

    // Concurrency: wait for an in-flight regeneration of the same original.
    const lockKey = path.join(guestDir, baseName);
    const inFlight = this.regenerationLocks.get(lockKey);
    if (inFlight) {
      await inFlight; // never rejects — errors are handled inside the lock
      return resolveVariant();
    }

    // Negative cache: skip a known-unregenerable original for a short window so
    // a corrupt/deleted original does not trigger a sharp attempt + error log
    // on every request.
    const failedUntil = this.failedRegenerations.get(lockKey);
    if (failedUntil !== undefined) {
      if (failedUntil > Date.now()) return resolveVariant();
      this.failedRegenerations.delete(lockKey);
    }

    const lockPromise = (async () => {
      try {
        const originalPath = await this.findOriginalImage(guestDir, baseName);
        if (!originalPath || !this.isInsideBasePath(originalPath)) {
          this.rememberRegenerationFailure(lockKey);
          return;
        }

        const buffer = await fs.readFile(/*turbopackIgnore: true*/ originalPath);
        // Reuses the same generateImageAssets pipeline as uploads — produces
        // both thumb + medium and the meta JSON in one pass, so the sibling
        // variant and future requests are covered too.
        await this.generateImageAssets(buffer, guestDir, baseName);
        this.failedRegenerations.delete(lockKey);
        console.warn(
          `[storage] Regenerated missing variant(s) for ` +
            `"${path.relative(this.basePath, guestDir)}/${baseName}"`
        );
      } catch (error) {
        this.rememberRegenerationFailure(lockKey);
        console.error(`[storage] Variant regeneration failed for "${absolutePath}":`, error);
      } finally {
        this.regenerationLocks.delete(lockKey);
      }
    })();

    this.regenerationLocks.set(lockKey, lockPromise);
    await lockPromise;
    return resolveVariant();
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

    if (source.mimeType.startsWith('image/')) {
      const buffer = await fs.readFile(absolutePath);
      const result = await this.generateImageAssets(buffer, absoluteDir, baseName);
      width = result.width;
      height = result.height;
    }
    // Videos: no variants exist, no meta written — walkDirectory() already
    // hardcodes 720×480 for video dimensions regardless of meta files.

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
        const dirName = entry.name.toLowerCase();
        const isStorageRoot = path.resolve(dirPath) === path.resolve(basePath);
        // Synology metadata directories — never walk.
        if (dirName === '@eadir') continue;
        // Generated variant/metadata directories only live inside a guest folder.
        if (!isStorageRoot && (dirName === 'thumb' || dirName === 'medium' || dirName === 'meta')) {
          continue;
        }
        // Quarantined (untrusted) files live at the storage root; never list them.
        if (isStorageRoot && dirName === 'quarantine') continue;
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
          normalizedPath.includes('/quarantine/') ||
          normalizedPath.startsWith('quarantine/') ||
          normalizedPath.startsWith('@eadir/') ||
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
