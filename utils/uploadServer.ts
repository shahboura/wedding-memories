import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import Busboy from 'busboy';
import { ValidationError } from './errors';

/** Maximum image file size: 20 MB */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
/** Maximum video file size: 500 MB */
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

/**
 * Magic byte signatures for allowed file types.
 * Used to validate actual file content regardless of the client-provided MIME type.
 */
const MAGIC_BYTES: Array<{
  mime: string;
  bytes: number[];
  offset?: number;
}> = [
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // GIF87a / GIF89a
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  // MP4/MOV: ....ftyp at offset 4
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  // AVI: RIFF....AVI
  { mime: 'video/avi', bytes: [0x52, 0x49, 0x46, 0x46] },
  // WebM/MKV (Matroska): 1A 45 DF A3
  { mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  // MOV (also uses ftyp, handled by mp4 entry above)
];

export type UploadPayload = {
  guestName: string;
  tempFilePath: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
};

function validateGuestNameValue(guestName: string | undefined): string {
  const trimmedGuestName = guestName?.trim() || '';
  if (!trimmedGuestName) {
    throw new ValidationError('Guest name is required', 'guestName');
  }

  if (trimmedGuestName.length > 100) {
    throw new ValidationError('Guest name must be less than 100 characters', 'guestName');
  }

  return trimmedGuestName;
}

/**
 * Validates that a file's actual content matches an allowed media type
 * by checking magic byte signatures.
 */
export function validateMagicBytes(buffer: Uint8Array): boolean {
  for (const sig of MAGIC_BYTES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;

    const matches = sig.bytes.every((b, i) => buffer[offset + i] === b);
    if (matches) return true;
  }
  return false;
}

/**
 * Quarantines a suspicious file that failed magic byte validation.
 */
export async function quarantineFileFromPath(
  tempFilePath: string,
  originalName: string,
  mimeType: string,
  guestName: string,
  size: number
): Promise<void> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(7);
  const safeFileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const quarantineName = `${timestamp}-${randomSuffix}-${safeFileName}`;

  const basePath = process.env.LOCAL_STORAGE_PATH || '/app/uploads';
  const quarantineDir = path.join(basePath, 'quarantine');
  await fs.mkdir(quarantineDir, { recursive: true });

  const quarantinePath = path.join(quarantineDir, quarantineName);
  try {
    await fs.rename(tempFilePath, quarantinePath);
  } catch {
    await fs.copyFile(tempFilePath, quarantinePath);
    await fs.unlink(tempFilePath).catch(() => undefined);
  }

  console.warn(
    `[QUARANTINE] Suspicious file from guest "${guestName}": ` +
      `name="${originalName}", type="${mimeType}", size=${size}, ` +
      `savedAs="${quarantineName}"`
  );
}

export async function parseMultipartRequest(request: Request): Promise<UploadPayload> {
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('multipart/form-data')) {
    throw new ValidationError('Invalid form data');
  }

  const tempDir = path.join(os.tmpdir(), 'wedding-memories');
  await fs.mkdir(tempDir, { recursive: true });

  return new Promise<UploadPayload>(async (resolve, reject) => {
    const busboy = Busboy({ headers: { 'content-type': contentType } });
    const fields = new Map<string, string>();
    let filePath = '';
    let fileSize = 0;
    let fileMime = '';
    let fileName = '';
    let fileStream: ReturnType<typeof createWriteStream> | null = null;
    let resolved = false;
    let rejected = false;

    const cleanup = async () => {
      if (fileStream) {
        fileStream.destroy();
      }
      if (filePath) {
        try {
          await fs.unlink(filePath);
        } catch {
          // ignore
        }
      }
    };

    busboy.on('field', (name: string, value: string) => {
      fields.set(name, value);
    });

    busboy.on('file', (name: string, file: NodeJS.ReadableStream, info) => {
      if (name !== 'file') {
        file.resume();
        return;
      }

      fileName = info.filename || 'upload';
      fileMime = info.mimeType || '';

      if (!fileMime.startsWith('image/') && !fileMime.startsWith('video/')) {
        file.resume();
        rejected = true;
        reject(new ValidationError('File must be a valid image or video format', 'file'));
        return;
      }

      const fileId = randomUUID();
      filePath = path.join(tempDir, `${fileId}-${fileName}`);
      fileStream = createWriteStream(filePath);

      file.on('data', (chunk: Buffer) => {
        fileSize += chunk.length;
        const maxSize = fileMime.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
        if (fileSize > maxSize) {
          file.unpipe(fileStream!);
          fileStream?.destroy();
          file.resume();
          rejected = true;
          reject(
            new ValidationError(
              `File size exceeds maximum allowed size of ${Math.round(maxSize / (1024 * 1024))}MB`,
              'file'
            )
          );
        }
      });

      file.on('error', (error: Error) => {
        rejected = true;
        reject(error);
      });

      fileStream.on('error', (error: Error) => {
        rejected = true;
        reject(error);
      });

      fileStream.on('close', () => {
        if (resolved || rejected) return;
        const guestName = validateGuestNameValue(fields.get('guestName'));
        const widthValue = fields.get('width');
        const heightValue = fields.get('height');
        const width = widthValue ? Number(widthValue) : undefined;
        const height = heightValue ? Number(heightValue) : undefined;

        resolved = true;
        resolve({
          guestName,
          tempFilePath: filePath,
          originalFileName: fileName,
          mimeType: fileMime,
          size: fileSize,
          width: Number.isFinite(width) ? width : undefined,
          height: Number.isFinite(height) ? height : undefined,
        });
      });

      file.pipe(fileStream);
    });

    busboy.on('error', async (error: Error) => {
      await cleanup();
      reject(error);
    });

    busboy.on('finish', async () => {
      if (!filePath && !resolved) {
        await cleanup();
        reject(new ValidationError('Valid file is required', 'file'));
      }
    });

    busboy.on('filesLimit', () => {
      rejected = true;
      reject(new ValidationError('Only one file can be uploaded at a time', 'file'));
    });

    const body = request.body;
    if (!body) {
      reject(new ValidationError('Missing upload body'));
      return;
    }

    try {
      const nodeReadable = Readable.fromWeb(body as unknown as NodeWebReadableStream);
      nodeReadable.pipe(busboy);
    } catch (error) {
      await cleanup();
      reject(error);
    }
  });
}
