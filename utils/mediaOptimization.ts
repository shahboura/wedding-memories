/**
 * Storage-agnostic media optimization utilities.
 *
 * This module provides utilities that work with any storage provider
 * (Cloudinary, S3/Wasabi, Local) and generate appropriate URLs for both
 * images and videos based on the configured storage provider.
 */

import type { MediaProps } from './types';
import { getImageUrl, getThumbnailUrl, getFullUrl } from './imageUrl';
import { appConfig, StorageProvider } from '../config';

const urlCache = new Map<string, string>();
const URL_CACHE_MAX_SIZE = 5000;

function getOptimizedMediaUrl(
  publicId: string,
  resourceType: 'image' | 'video',
  quality: 'thumb' | 'medium' | 'full' = 'medium'
): string {
  const cacheKey = `${publicId}-${resourceType}-${quality}`;

  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey)!;
  }

  let url: string;

  if (appConfig.storage === StorageProvider.S3 || appConfig.storage === StorageProvider.Local) {
    // For S3/Local, return the URL directly (already a presigned URL or /api/media/… path)
    url = publicId;
  } else {
    switch (quality) {
      case 'thumb':
        url = getThumbnailUrl(publicId, resourceType);
        break;
      case 'medium':
        url = getImageUrl(publicId, resourceType, 720, undefined, 'medium');
        break;
      case 'full':
        url = getFullUrl(publicId, resourceType);
        break;
    }
  }

  // Evict oldest entries if cache is full
  if (urlCache.size >= URL_CACHE_MAX_SIZE) {
    const firstKey = urlCache.keys().next().value;
    if (firstKey !== undefined) {
      urlCache.delete(firstKey);
    }
  }
  urlCache.set(cacheKey, url);
  return url;
}

/**
 * Generates responsive media sizes for Next.js Image component and video elements
 */
function getResponsiveMediaSizes(context: 'gallery' | 'modal' | 'thumb'): string {
  switch (context) {
    case 'gallery':
      return `
        (max-width: 640px) 100vw,
        (max-width: 1280px) 50vw,
        (max-width: 1536px) 33vw,
        25vw
      `;
    case 'modal':
      return '100vw';
    case 'thumb':
      return '180px';
    default:
      return '50vw';
  }
}

/**
 * Simple media prefetch utility for immediate use (like on hover)
 */
function simpleMediaPrefetch(url: string, resourceType: 'image' | 'video'): void {
  if (typeof window === 'undefined') return;

  const existing = document.querySelector(`link[href="${url}"]`);
  if (!existing) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = resourceType;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}

/**
 * Prefetch media on user interaction (hover, focus)
 */
export function prefetchMediaOnInteraction(
  item: MediaProps,
  quality: 'thumb' | 'medium' | 'full' = 'full'
): void {
  const url = getOptimizedMediaUrl(item.public_id, item.resource_type, quality);
  simpleMediaPrefetch(url, item.resource_type);
}

/**
 * Generates optimized props for the storage-aware media component.
 */
export function getOptimizedMediaProps(
  item: MediaProps,
  context: 'gallery' | 'modal' | 'thumb' = 'gallery',
  options: {
    priority?: boolean;
    quality?: 'thumb' | 'medium' | 'full';
  } = {}
) {
  const { priority = false, quality = 'medium' } = options;

  if (item.resource_type === 'video') {
    // For thumbnail context, generate a static image thumbnail instead of video
    if (context === 'thumb') {
      const thumbnailImageSrc =
        appConfig.storage === StorageProvider.Cloudinary
          ? (() => {
              const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
              if (!cloudName) return item.public_id;
              if (item.public_id.startsWith('http')) return item.public_id;
              return `https://res.cloudinary.com/${cloudName}/video/upload/c_fill,w_180,h_120,so_1.0,f_jpg,q_auto/${item.public_id}`;
            })()
          : item.public_id; // S3/Local: use URL directly

      return {
        src: thumbnailImageSrc,
        alt: `Wedding video thumbnail${item.guestName && item.guestName !== 'Unknown Guest' ? ` shared by ${item.guestName}` : ''}`,
        width: '180',
        height: '120',
        sizes: getResponsiveMediaSizes(context),
        priority: false,
        loading: 'lazy' as const,
        resource_type: 'image' as const, // Treat as image for thumbnail display
        format: 'jpg',
        context,
      };
    }

    // For S3/Local, use URL directly since we don't have quality transformations
    // For Cloudinary, use optimized quality based on context
    const videoSrc =
      appConfig.storage === StorageProvider.Cloudinary
        ? getOptimizedMediaUrl(
            item.public_id,
            item.resource_type,
            context === 'gallery' ? 'medium' : 'full'
          )
        : item.public_id; // S3/Local: use URL directly

    return {
      src: videoSrc,
      alt: `Wedding video${item.guestName && item.guestName !== 'Unknown Guest' ? ` shared by ${item.guestName}` : ''}`,
      width: item.width,
      height: item.height,
      sizes: getResponsiveMediaSizes(context),
      priority: false, // Videos should never have priority to avoid blocking image loading
      loading: 'lazy' as const,
      resource_type: 'video' as const,
      format: item.format as string,
      controls: context === 'modal',
      context,
    };
  }

  // It's an image, use appropriate URL handling
  const imageSrc =
    appConfig.storage === StorageProvider.Cloudinary
      ? getOptimizedMediaUrl(item.public_id, item.resource_type, quality)
      : item.public_id; // S3/Local: use URL directly

  return {
    src: imageSrc,
    alt: `Wedding photo${item.guestName && item.guestName !== 'Unknown Guest' ? ` shared by ${item.guestName}` : ''}`,
    width: item.width,
    height: item.height,
    sizes: getResponsiveMediaSizes(context),
    priority,
    loading: priority ? ('eager' as const) : ('lazy' as const),
    ...(item.blurDataUrl
      ? { placeholder: 'blur' as const, blurDataURL: item.blurDataUrl }
      : { placeholder: 'empty' as const }),
    quality: quality === 'thumb' ? 60 : quality === 'medium' ? 80 : 90,
    resource_type: 'image' as const,
    format: item.format as string,
  };
}
