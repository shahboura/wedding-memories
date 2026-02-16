import type { MediaProps } from './types';
import { appConfig, StorageProvider } from '../config';

const cache = new Map<string, string>();

// Simple grey placeholder for non-Cloudinary storage (no CDN-based blur generation)
const GREY_PLACEHOLDER =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyfiWVBpGhEJHaPj/fJZ5bheT4FS5q/QIIqqOqNHcKBQKiBLIj3bDfPdA4h5/nKuJk7B+3JT6OX//Z';

export default async function getBase64ImageUrl(image: MediaProps): Promise<string> {
  const cacheKey = image.public_id;
  let url = cache.get(cacheKey);
  if (url) {
    return url;
  }

  if (image.resource_type === 'video') {
    return '';
  }

  // Blur placeholders via Cloudinary CDN only work for Cloudinary storage
  if (appConfig.storage !== StorageProvider.Cloudinary) {
    return GREY_PLACEHOLDER;
  }

  try {
    const response = await fetch(
      `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/f_jpg,w_8,q_70/${image.public_id}.${image.format}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    url = `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`;
    cache.set(cacheKey, url);
    return url;
  } catch (error) {
    console.error('Error generating blur placeholder:', error);
    return GREY_PLACEHOLDER;
  }
}
