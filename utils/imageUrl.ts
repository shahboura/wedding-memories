/**
 * Media URL utility for storage-agnostic media handling.
 * Generates appropriate URLs based on the configured storage provider.
 */
class MediaUrlService {
  /**
   * Gets the optimized media URL for display.
   *
   * @param publicId - The media public ID or full URL
   * @param resourceType - The type of media (image or video)
   * @param width - Desired width
   * @param height - Desired height
   * @param quality - Media quality ('auto', 'low', 'medium', 'high')
   * @returns Optimized media URL
   */
  static getMediaUrl(
    publicId: string,
    _resourceType: 'image' | 'video',
    _width?: number,
    _height?: number,
    _quality: 'auto' | 'low' | 'medium' | 'high' = 'auto'
  ): string {
    return publicId;
  }

  /**
   * Gets the thumbnail URL for preview purposes.
   *
   * @param publicId - The media public ID or full URL
   * @param resourceType - The type of media (image or video)
   * @returns Thumbnail URL
   */
  static getThumbnailUrl(publicId: string, _resourceType: 'image' | 'video'): string {
    return publicId;
  }

  /**
   * Gets the full resolution URL for modal viewing.
   *
   * @param publicId - The media public ID or full URL
   * @param resourceType - The type of media (image or video)
   * @returns Full resolution URL
   */
  static getFullUrl(publicId: string, _resourceType: 'image' | 'video'): string {
    return publicId;
  }

  /**
   * Gets the download URL for a media item (original quality).
   *
   * @param publicId - The media public ID or full URL
   * @param resourceType - The type of media (image or video)
   * @param format - The media format (jpg, mp4, etc.)
   * @returns Download URL for the original media
   */
  static getDownloadUrl(
    publicId: string,
    _resourceType: 'image' | 'video',
    _format: string
  ): string {
    return publicId;
  }

  /**
   * Gets the external link URL for viewing the media in a new tab.
   *
   * @param publicId - The media public ID or full URL
   * @param resourceType - The type of media (image or video)
   * @param format - The media format (jpg, mp4, etc.)
   * @returns External link URL
   */
  static getExternalUrl(
    publicId: string,
    _resourceType: 'image' | 'video',
    _format: string
  ): string {
    return publicId;
  }
}

/**
 * Convenience functions for common use cases.
 */
export const getImageUrl = MediaUrlService.getMediaUrl;
export const getThumbnailUrl = MediaUrlService.getThumbnailUrl;
export const getFullUrl = MediaUrlService.getFullUrl;
export const getDownloadUrl = MediaUrlService.getDownloadUrl;
export const getExternalUrl = MediaUrlService.getExternalUrl;
