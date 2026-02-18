import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import { storage } from '../../../storage';
import { checkUploadRateLimit, createRateLimitHeaders } from '../../../utils/rateLimit';
import {
  getEventTokenCookieHeader,
  isEventTokenRequired,
  isEventTokenValid,
} from '../../../utils/eventToken';
import { ValidationError } from '../../../utils/errors';
import type { ApiErrorResponse } from '../../../utils/types';
import {
  parseMultipartRequest,
  quarantineFileFromPath,
  validateMagicBytes,
} from '../../../utils/uploadServer';

// Use App Router route segment config (not Pages Router config)
export const runtime = 'nodejs';

/**
 * Handles media upload requests.
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
