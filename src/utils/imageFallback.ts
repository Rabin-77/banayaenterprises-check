import React from 'react';
import { Product } from '../types';

const PRODUCT_FALLBACK_IMAGES: Record<string, string> = {
  'pure-honey': '/assets/aistudio/1_7a3bf903.png',
  'magarantha-thean': '/assets/aistudio/1_f09ecd47.png',
  'malai-thean': '/images/malai_thean_bottle.jpg',
  'mixed-nuts': '/assets/aistudio/2_6b73aea0.png',
  'honey-amla': '/images/banaya_amla.webp',
  'gulkand': '/assets/aistudio/3_6493340b.png',
  'karuppukavani-kanji': '/images/karuppu_kavuni_kanji_front.jpg',
  'mudavatukal-soup': '/images/mudavatukal_soup_front.jpeg',
  'murungai-leaf-powder': '/images/murungai_pouch_front.jpg',
  'curry-leaf-powder': '/images/curry_leaf_pouch_front.jpg',
  'natural-soap': '/assets/aistudio/3_2e9e6c51.png',
  'desi-cow-ghee': '/assets/aistudio/2_4b4979ee.png',
  'abc-malt': '/images/abc_malt_front.jpg'
};

const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  'honey-sweeteners': '/assets/aistudio/1_7a3bf903.png',
  'health-drinks': '/images/abc_malt_front.jpg',
  'herbal-powders': '/images/murungai_pouch_front.jpg',
  'ghee-foods': '/assets/aistudio/2_4b4979ee.png',
  'nuts-dryfruits': '/assets/aistudio/2_6b73aea0.png',
  'traditional-wellness': '/images/banaya_amla.webp',
  'herbal-products': '/assets/aistudio/3_2e9e6c51.png'
};

export function getFallbackProductImage(
  product?: Pick<Product, 'id' | 'categorySlug'> | null
): string {
  if (!product) return '/images/banaya_logo.png';
  return (
    PRODUCT_FALLBACK_IMAGES[product.id] ||
    CATEGORY_FALLBACK_IMAGES[product.categorySlug] ||
    '/images/banaya_logo.png'
  );
}

export function isValidImageSource(src?: string): boolean {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed === '[object Object]') {
    return false;
  }
  if (trimmed.startsWith('/uploads/1-179456')) {
    return false;
  }
  if (trimmed.startsWith('data:')) {
    return /^data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]{16,}/i.test(trimmed);
  }
  return trimmed.startsWith('/') || trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

export function isLocalAssetImage(src?: string): boolean {
  if (!src) return false;
  return (
    src.startsWith('/images/') ||
    src.startsWith('/assets/') ||
    src.startsWith('/uploads/') ||
    src.startsWith('data:image/')
  );
}

export function isBrokenLegacyUpload(src?: string): boolean {
  return !isValidImageSource(src);
}

export function healLegacyProductImages(product: Product): Product {
  const fallbackImg = getFallbackProductImage(product);
  const healedImage = isValidImageSource(product.image) ? product.image.trim() : fallbackImg;

  const rawGallery = Array.isArray(product.gallery) ? product.gallery : [];
  const validGallery = Array.from(
    new Set(
      rawGallery
        .filter((img) => isValidImageSource(img))
        .map((img) => img.trim())
    )
  );

  const mergedGallery = [
    healedImage,
    ...validGallery.filter((img) => img !== healedImage)
  ];

  if (
    healedImage === product.image &&
    mergedGallery.length === rawGallery.length &&
    mergedGallery.every((img, idx) => img === rawGallery[idx])
  ) {
    return product;
  }

  return {
    ...product,
    image: healedImage,
    gallery: mergedGallery
  };
}

export function handleProductImageLoad(
  event: React.SyntheticEvent<HTMLImageElement>
): void {
  const img = event.currentTarget;
  delete img.dataset.fallbackStage;
  delete img.dataset.failedSrc;
}

export function handleProductImageError(
  event: React.SyntheticEvent<HTMLImageElement>,
  product?: Pick<Product, 'id' | 'categorySlug'> | null
): void {
  const img = event.currentTarget;
  const currentSrc = img.getAttribute('src') || '';
  const fallback = getFallbackProductImage(product);

  // Reset stage automatically whenever React binds a brand-new src URL to this img node
  if (img.dataset.failedSrc && img.dataset.failedSrc !== currentSrc) {
    delete img.dataset.fallbackStage;
  }
  img.dataset.failedSrc = currentSrc;

  if (img.dataset.fallbackStage === 'done') {
    return;
  }

  if (img.dataset.fallbackStage !== 'primary' && currentSrc !== fallback) {
    img.dataset.fallbackStage = 'primary';
    img.src = fallback;
    return;
  }

  if (currentSrc !== '/images/banaya_logo.png') {
    img.dataset.fallbackStage = 'done';
    img.src = '/images/banaya_logo.png';
  }
}
