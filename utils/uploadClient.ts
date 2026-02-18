const FALLBACK_VIDEO_WIDTH = 720;
const FALLBACK_VIDEO_HEIGHT = 480;
const VIDEO_METADATA_TIMEOUT_MS = 4000;

export type VideoMetadata = {
  width: number;
  height: number;
};

export async function getVideoMetadata(file: File): Promise<VideoMetadata> {
  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<VideoMetadata>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ width: FALLBACK_VIDEO_WIDTH, height: FALLBACK_VIDEO_HEIGHT });
        }
      }, VIDEO_METADATA_TIMEOUT_MS);

      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve({
          width: video.videoWidth || FALLBACK_VIDEO_WIDTH,
          height: video.videoHeight || FALLBACK_VIDEO_HEIGHT,
        });
      };
      video.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve({ width: FALLBACK_VIDEO_WIDTH, height: FALLBACK_VIDEO_HEIGHT });
      };
      video.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function uploadWithXHR(
  formData: FormData,
  onProgress: (progress: number) => void
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      onProgress(progress);
    };

    xhr.onload = () => {
      const responseData = xhr.response as { error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(responseData);
        return;
      }

      reject(new Error(responseData?.error || 'Failed to upload file'));
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading file'));
    };

    xhr.send(formData);
  });
}
