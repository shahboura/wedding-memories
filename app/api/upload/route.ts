import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import Busboy from 'busboy';
import { storage } from '../../../storage';
import { checkUploadRateLimit, createRateLimitHeaders } from '../../../utils/rateLimit';
import {
  getEventTokenCookieHeader,
  isEventTokenRequired,
  isEventTokenValid,
} from '../../../utils/eventToken';
import { ValidationError } from '../../../utils/errors';
import type { ApiErrorResponse } from '../../../utils/types';

// Use App Router route segment config (not Pages Router config)
export const runtime = 'nodejs';

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

/**
 * Validates that a file's actual content matches an allowed media type
 * by checking magic byte signatures.
 *
 * @param buffer - First bytes of the file
 * @returns true if magic bytes match a known image/video format
 */
function validateMagicBytes(buffer: Uint8Array): boolean {
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
 * Files are saved to a quarantine directory for manual review rather than
 * being silently rejected — this avoids confusing users whose legitimate
 * files might have unusual headers.
 *
 * @param file - The suspicious file
 * @param guestName - Guest who uploaded the file
 */
async function quarantineFileFromPath(
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

/**
 * Validates the upload request payload.
 *
 * @param formData - Form data containing file and guest name
 * @throws {ValidationError} If validation fails
 */
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

type UploadPayload = {
  guestName: string;
  tempFilePath: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
};

async function parseMultipartRequest(request: NextRequest): Promise<UploadPayload> {
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

/**
 * Validates metadata-only upload requests.
 *
 * @param body - JSON body containing file metadata
 * @throws {ValidationError} If validation fails
 */
/**
 * Handles media upload requests using the configured storage provider.
 *
 * @param request - The incoming request containing file and guest name
 * @returns JSON response with upload URL or error
 */
export async function POST(request: NextRequest): Promise<
  NextResponse<
    | {
        url: string;
        guestName?: string;
      }
    | ApiErrorResponse
  >
> {
  try {
    if (isEventTokenRequired() && !isEventTokenValid(request)) {
      const errorResponse: ApiErrorResponse = {
        error: 'Unauthorized upload',
        details: 'A valid event token is required to upload media.',
      };
      return NextResponse.json(errorResponse, { status: 401 });
    }

    const uploadPayload = await parseMultipartRequest(request);

    const rateLimitResult = checkUploadRateLimit(request, uploadPayload.guestName);
    if (!rateLimitResult.success) {
      const errorResponse: ApiErrorResponse = {
        error: 'Too many uploads',
        details: rateLimitResult.message || 'Please wait before uploading more files.',
      };

      return NextResponse.json(errorResponse, {
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult),
      });
    }

    const metadata =
      Number.isFinite(uploadPayload.width) && Number.isFinite(uploadPayload.height)
        ? { width: uploadPayload.width as number, height: uploadPayload.height as number }
        : undefined;

    // Validate magic bytes — quarantine files whose actual content doesn't match
    // a known image/video signature (prevents spoofed MIME types)
    const headerStream = await fs.open(uploadPayload.tempFilePath, 'r');
    const headerBuffer = Buffer.alloc(16);
    await headerStream.read(headerBuffer, 0, 16, 0);
    await headerStream.close();

    if (!validateMagicBytes(headerBuffer)) {
      await quarantineFileFromPath(
        uploadPayload.tempFilePath,
        uploadPayload.originalFileName,
        uploadPayload.mimeType,
        uploadPayload.guestName,
        uploadPayload.size
      );
      return NextResponse.json(
        {
          error: 'File is under review',
          details:
            'Your file could not be verified automatically and has been quarantined for manual review. ' +
            'Please try uploading a standard image or video file.',
        },
        {
          status: 422,
          headers: createRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const uploadResult = await storage.uploadFromPath(
      {
        tempPath: uploadPayload.tempFilePath,
        originalName: uploadPayload.originalFileName,
        mimeType: uploadPayload.mimeType,
        size: uploadPayload.size,
      },
      uploadPayload.guestName,
      metadata
    );

    await fs.unlink(uploadPayload.tempFilePath).catch(() => undefined);

    const mediaData = {
      ...uploadResult,
      guestName: uploadPayload.guestName,
      uploadDate: uploadResult.created_at,
    };

    const headers: Record<string, string> = {
      ...createRateLimitHeaders(rateLimitResult),
    };
    const eventCookieHeader = getEventTokenCookieHeader();
    if (eventCookieHeader) {
      headers['Set-Cookie'] = eventCookieHeader;
    }

    return NextResponse.json(mediaData, {
      status: 201,
      headers,
    });
  } catch (error) {
    console.error('Upload error:', error);

    if (error instanceof ValidationError) {
      const errorResponse: ApiErrorResponse = {
        error: error.message,
        details: error.field ? `Validation failed for field: ${error.field}` : undefined,
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const errorResponse: ApiErrorResponse = {
      error: 'Failed to upload file',
      details: 'Please try again or contact support if the problem persists',
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
