import { getAdminSessionPasskey } from './adminAuth';

export class AdminAuthError extends Error {
  constructor(message = 'Admin verification required. Please sign out and re-enter your passkey.') {
    super(message);
    this.name = 'AdminAuthError';
  }
}

/**
 * Resize and optimize an image file on a canvas so uploads are crisp,
 * compact across Chrome + iOS Safari, and never exceed browser storage or payload limits.
 */
export async function optimizeImageToDataUrl(file: File, maxDimension = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      if (!rawDataUrl || !rawDataUrl.startsWith('data:image/')) {
        reject(new Error('Unsupported or unreadable image file'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode selected image file'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (!width || !height) {
          reject(new Error('Image has invalid dimensions'));
          return;
        }

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width));
            width = maxDimension;
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Try compact WebP first (preserves transparency when supported, much smaller than PNG)
        let output = '';
        try {
          const webpCandidate = canvas.toDataURL('image/webp', 0.84);
          if (webpCandidate.startsWith('data:image/webp')) {
            output = webpCandidate;
          }
        } catch {
          // Safari / older WebViews do not support image/webp canvas encoding
        }

        // Fallback to white-backed JPEG if WebP isn't supported or output is still too heavy
        if (!output || output.length > 320_000) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.restore();

          output = canvas.toDataURL('image/jpeg', 0.84);
          if (output.length > 280_000) {
            output = canvas.toDataURL('image/jpeg', 0.72);
          }
        }

        resolve(output);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Optimizes and uploads an image file to the Express server (/api/upload),
 * returning a lightweight persistent /uploads/... URL (or compact data URL fallback only when offline/static).
 */
export async function uploadProductImage(file: File): Promise<string> {
  const optimizedDataUrl = await optimizeImageToDataUrl(file);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passkey': getAdminSessionPasskey()
      },
      body: JSON.stringify({
        dataUrl: optimizedDataUrl,
        filename: file.name
      })
    });

    if (response.status === 401) {
      throw new AdminAuthError();
    }

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const result = (await response.json()) as { url?: string };
        if (result.url) {
          return result.url;
        }
      }
    }
  } catch (err) {
    if (err instanceof AdminAuthError) {
      throw err;
    }
    console.warn('Server upload unavailable, using optimized inline image fallback:', err);
  }

  return optimizedDataUrl;
}
