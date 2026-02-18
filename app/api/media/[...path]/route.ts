import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import { isEventTokenRequired, isEventTokenValid } from '../../../../utils/eventToken';

export const runtime = 'nodejs';

/**
 * MIME type lookup for media formats allowed to be served.
 *
 * Security: SVG is intentionally excluded because SVG files can contain
 * embedded <script> tags, enabling stored XSS attacks. AVIF and MKV are
 * excluded because they are not in the upload validation allowlist either
 * (defense-in-depth).
 */
const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  webm: 'video/webm',
};

/**
 * Converts a Node.js Readable stream into a Web API ReadableStream.
 */
function nodeStreamToWebStream(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on('end', () => {
        controller.close();
      });
      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

/**
 * Serves media files from the local storage directory.
 *
 * Security:
 * - Path traversal prevention (rejects ../ sequences)
 * - Only serves files from the configured LOCAL_STORAGE_PATH
 * - Only serves known media MIME types (SVG excluded — XSS vector)
 * - Files are streamed to avoid loading large videos into memory
 * - Supports HTTP Range requests for video seeking and thumbnails
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  if (isEventTokenRequired() && !isEventTokenValid(request)) {
    return NextResponse.json(
      { error: 'Unauthorized access', details: 'A valid event token is required to view media.' },
      { status: 401 }
    );
  }
  const { path: pathSegments } = await params;

  // Reject empty paths
  if (!pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ error: 'File path is required' }, { status: 400 });
  }

  // Security: reject path traversal attempts
  const joinedPath = pathSegments.join('/');
  if (joinedPath.includes('..') || joinedPath.includes('\\')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const basePath = process.env.LOCAL_STORAGE_PATH || '/app/uploads';
  const filePath = path.join(basePath, ...pathSegments);

  // Security: ensure resolved path is still within basePath
  const resolvedBase = path.resolve(basePath);
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedBase)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Check file exists and get size for Content-Length
  let fileSize: number;
  try {
    const stat = await fs.stat(resolvedFile);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 });
    }
    fileSize = stat.size;
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Determine MIME type
  const ext = path.extname(resolvedFile).replace('.', '').toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });
  }

  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
        },
      });
    }

    const startRaw = match[1];
    const endRaw = match[2];
    const start = startRaw ? Number.parseInt(startRaw, 10) : 0;
    let end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < 0 || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
        },
      });
    }

    if (start >= fileSize) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
        },
      });
    }

    end = Math.min(end, fileSize - 1);
    const chunkSize = end - start + 1;

    const nodeStream = createReadStream(resolvedFile, { start, end });
    const webStream = nodeStreamToWebStream(nodeStream);

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Length': chunkSize.toString(),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  // Stream the file instead of buffering into memory
  const nodeStream = createReadStream(resolvedFile);
  const webStream = nodeStreamToWebStream(nodeStream);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400, immutable',
      'Content-Length': fileSize.toString(),
      'Accept-Ranges': 'bytes',
    },
  });
}
