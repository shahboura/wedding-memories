import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
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
async function quarantineFile(file: File, guestName: string): Promise<void> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(7);
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const quarantineName = `${timestamp}-${randomSuffix}-${safeFileName}`;

  const basePath = process.env.LOCAL_STORAGE_PATH || '/app/uploads';
  const quarantineDir = path.join(basePath, 'quarantine');
  await fs.mkdir(quarantineDir, { recursive: true });

  const quarantinePath = path.join(quarantineDir, quarantineName);
  const arrayBuffer = await file.arrayBuffer();
  await fs.writeFile(quarantinePath, Buffer.from(arrayBuffer));

  console.warn(
    `[QUARANTINE] Suspicious file from guest "${guestName}": ` +
      `name="${file.name}", type="${file.type}", size=${file.size}, ` +
      `savedAs="${quarantineName}"`
  );
}

/**
 * Validates the upload request payload.
 *
 * @param formData - Form data containing file and guest name
 * @throws {ValidationError} If validation fails
 */
function validateUploadRequest(formData: FormData): { file: File; guestName: string } {
  const file = formData.get('file') as File;
  const guestName = formData.get('guestName') as string;

  if (!file || !(file instanceof File)) {
    throw new ValidationError('Valid file is required', 'file');
  }

  const isValidImage = file.type.startsWith('image/');
  const isValidVideo = file.type.startsWith('video/');

  // Both Cloudinary and S3 now support videos
  if (!isValidImage && !isValidVideo) {
    throw new ValidationError('File must be a valid image or video format', 'file');
  }

  // Server-side file size enforcement (mirrors client-side limits)
  const maxSize = isValidVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    const sizeMB = Math.round(file.size / (1024 * 1024));
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    throw new ValidationError(
      `File size (${sizeMB}MB) exceeds maximum allowed size of ${maxSizeMB}MB`,
      'file'
    );
  }

  const trimmedGuestName = guestName?.trim() || '';
  if (!trimmedGuestName) {
    throw new ValidationError('Guest name is required', 'guestName');
  }

  if (trimmedGuestName.length > 100) {
    throw new ValidationError('Guest name must be less than 100 characters', 'guestName');
  }

  return { file, guestName: trimmedGuestName };
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

    const rateLimitResult = checkUploadRateLimit(request);
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

    // Check content type to determine request format
    // Handle uploads through Next.js server (FormData)
    const formData = await request.formData().catch(() => {
      throw new ValidationError('Invalid form data');
    });

    const { file, guestName } = validateUploadRequest(formData);
    const widthValue = formData.get('width');
    const heightValue = formData.get('height');
    const width = typeof widthValue === 'string' ? Number(widthValue) : undefined;
    const height = typeof heightValue === 'string' ? Number(heightValue) : undefined;
    const metadata =
      Number.isFinite(width) && Number.isFinite(height)
        ? { width: width as number, height: height as number }
        : undefined;

    // Validate magic bytes — quarantine files whose actual content doesn't match
    // a known image/video signature (prevents spoofed MIME types)
    const headerBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!validateMagicBytes(headerBytes)) {
      await quarantineFile(file, guestName);
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

    const uploadResult = await storage.upload(file, guestName, metadata);

    const mediaData = {
      ...uploadResult,
      guestName,
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
