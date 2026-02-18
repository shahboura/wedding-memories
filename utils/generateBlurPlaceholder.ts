import type { MediaProps } from './types';

// Simple grey placeholder for non-Cloudinary storage (no CDN-based blur generation)
const GREY_PLACEHOLDER =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyfiWVBpGhEJHaPj/fJZ5bheT4FS5q/QIIqqOqNHcKBQKiBLIj3bDfPdA4h5/nKuJk7B+3JT6OX//Z';

export default async function getBase64ImageUrl(image: MediaProps): Promise<string> {
  if (image.resource_type === 'video') {
    return '';
  }

  return image.blurDataUrl || GREY_PLACEHOLDER;
}
