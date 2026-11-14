import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { sortCatalogByCanonicalOrder } from './src/utils/catalogOrder';
import { DEFAULT_MEDIA_FOLDERS } from './src/data/defaultMediaFolders';
import type { MediaFolder, MediaFolderImage } from './src/types';

interface StoredProduct {
  id: string;
  name: string;
  tamilName?: string;
  tagline: string;
  category: string;
  categorySlug: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviewsCount: number;
  inStock: boolean;
  weightOptions: string[];
  defaultWeight: string;
  badges: string[];
  image: string;
  gallery: string[];
  description: string;
  ingredients: string[];
  keyBenefits: string[];
  howToUse: string;
  storageInfo?: string;
  origin: string;
  isBestSeller?: boolean;
  isNew?: boolean;
}

interface StoredOrder {
  id: string;
  date: string;
  items: Array<{
    product: StoredProduct;
    quantity: number;
    selectedWeight: string;
  }>;
  subtotal: number;
  discount: number;
  shipping: number;
  totalAmount: number;
  status: 'Processing' | 'Confirmed' | 'Shipped' | 'Out for Delivery' | 'Delivered';
  customerName: string;
  phone: string;
  email: string;
  shippingAddress: string;
  city: string;
  postalCode: string;
  paymentMethod: string;
  trackingNumber: string;
  transactionId?: string;
  bankRef?: string;
}

interface StoreState {
  products: StoredProduct[];
  orders: StoredOrder[];
  adminNotes: Record<string, string>;
  mediaFolders: MediaFolder[];
  updatedAt: number;
}

function parseCliPort(): number | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } else if (args[i].startsWith('--port=')) {
      const parsed = Number(args[i].slice('--port='.length));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
}

const PORT = parseCliPort() || Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DEFAULT_PRODUCTS_PATH = path.join(ROOT_DIR, 'src', 'data', 'products.json');
const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || 'banayana00123';

const isRunningTsx =
  process.execArgv.some((arg) => arg.includes('tsx')) ||
  (process.env._ || '').includes('tsx');

const isDev =
  process.env.NODE_ENV === 'development' ||
  process.env.npm_lifecycle_event === 'dev' ||
  isRunningTsx ||
  !fs.existsSync(path.join(DIST_DIR, 'index.html'));

const isProduction = !isDev;

function resolveWritableDir(primaryDir: string, fallbackDir: string): string {
  try {
    fs.mkdirSync(primaryDir, { recursive: true });
    const testFile = path.join(primaryDir, '.write-check');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return primaryDir;
  } catch {
    fs.mkdirSync(fallbackDir, { recursive: true });
    return fallbackDir;
  }
}

const DATA_DIR = resolveWritableDir(
  path.join(ROOT_DIR, 'data'),
  path.join('/tmp', 'banaya-data')
);

const UPLOADS_DIR = resolveWritableDir(
  path.join(ROOT_DIR, 'public', 'uploads'),
  path.join('/tmp', 'banaya-uploads')
);

const STORE_FILE = path.join(DATA_DIR, 'store.json');

function loadDefaultProducts(): StoredProduct[] {
  try {
    if (fs.existsSync(DEFAULT_PRODUCTS_PATH)) {
      const raw = fs.readFileSync(DEFAULT_PRODUCTS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as StoredProduct[];
      }
    }
  } catch (err) {
    console.error('Failed to read default products.json:', err);
  }
  return [];
}

function createInitialOrders(products: StoredProduct[]): StoredOrder[] {
  const byId = (id: string, fallbackIdx: number) =>
    products.find((p) => p.id === id) || products[fallbackIdx] || products[0];

  if (products.length === 0) return [];

  return [
    {
      id: 'STM-84920',
      date: '2026-11-10',
      items: [
        { product: byId('malai-thean', 2), quantity: 1, selectedWeight: '500g' },
        { product: byId('abc-malt', 6), quantity: 2, selectedWeight: '100g' }
      ],
      subtotal: 1700,
      discount: 170,
      shipping: 0,
      totalAmount: 1530,
      status: 'Delivered',
      customerName: 'Ananya Ramesh',
      phone: '+91 98401 23456',
      email: 'ananya.r@example.com',
      shippingAddress: '42, Lotus Lake Road, Anna Nagar',
      city: 'Chennai',
      postalCode: '600040',
      paymentMethod: 'UPI / Google Pay (UTR: 329048120)',
      trackingNumber: 'IND98427190IN'
    },
    {
      id: 'STM-85104',
      date: '2026-11-11',
      items: [
        { product: byId('pure-honey', 0), quantity: 2, selectedWeight: '500g' },
        { product: byId('gulkand', 3), quantity: 1, selectedWeight: '250g' }
      ],
      subtotal: 750,
      discount: 0,
      shipping: 0,
      totalAmount: 750,
      status: 'Processing',
      customerName: 'Dr. Senthil Kumar',
      phone: '+91 94432 87654',
      email: 'dr.senthil@apollo.org',
      shippingAddress: '15/B, Vaigai Avenue, K.K. Nagar',
      city: 'Madurai',
      postalCode: '625020',
      paymentMethod: 'Google Pay (Instant Verification)',
      trackingNumber: 'STM8831920IN'
    },
    {
      id: 'STM-85219',
      date: '2026-11-11',
      items: [
        { product: byId('mudavatukal-soup', 9), quantity: 3, selectedWeight: '100g' },
        { product: byId('karuppukavani-kanji', 10), quantity: 2, selectedWeight: '250g' }
      ],
      subtotal: 1240,
      discount: 100,
      shipping: 0,
      totalAmount: 1140,
      status: 'Shipped',
      customerName: 'Meenakshi Sundaram',
      phone: '+91 97890 11223',
      email: 'meenakshi.s@gmail.com',
      shippingAddress: '78, Cross Cut Road, Gandhipuram',
      city: 'Coimbatore',
      postalCode: '641012',
      paymentMethod: 'UPI / PhonePe',
      trackingNumber: 'IND7723910IN'
    }
  ];
}

function loadInitialStore(): StoreState {
  const defaultProducts = loadDefaultProducts();
  const repoStoreFile = path.join(ROOT_DIR, 'data', 'store.json');
  const candidateFiles = STORE_FILE === repoStoreFile ? [STORE_FILE] : [STORE_FILE, repoStoreFile];

  for (const filePath of candidateFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<StoreState>;
        return {
          products: Array.isArray(parsed.products) && parsed.products.length > 0
            ? sortCatalogByCanonicalOrder(parsed.products)
            : sortCatalogByCanonicalOrder(defaultProducts),
          orders: Array.isArray(parsed.orders) ? parsed.orders : createInitialOrders(defaultProducts),
          adminNotes: parsed.adminNotes && typeof parsed.adminNotes === 'object' ? parsed.adminNotes : {},
          mediaFolders: Array.isArray(parsed.mediaFolders)
            ? parsed.mediaFolders
            : JSON.parse(JSON.stringify(DEFAULT_MEDIA_FOLDERS)) as MediaFolder[],
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
        };
      }
    } catch (err) {
      console.error(`Failed to load ${filePath}, trying next fallback:`, err);
    }
  }

  return {
    products: sortCatalogByCanonicalOrder(defaultProducts),
    orders: createInitialOrders(defaultProducts),
    adminNotes: {
      'STM-84920': 'Delivered via DTDC Courier. Customer praised Honey aroma.',
      'STM-85104': 'Customer requested fresh batch honey jar. Verified via WhatsApp.',
      'STM-85219': 'Joint pain soup ordered for elderly parents. Shipped priority.'
    },
    mediaFolders: JSON.parse(JSON.stringify(DEFAULT_MEDIA_FOLDERS)) as MediaFolder[],
    updatedAt: Date.now()
  };
}

let storeState: StoreState = loadInitialStore();
const sseClients = new Set<Response>();

function persistStore(syncProductsSeed = false): void {
  storeState.updatedAt = Date.now();
  const tempFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(storeState, null, 2), 'utf8');
  fs.renameSync(tempFile, STORE_FILE);

  // Mirror product catalog into src/data/products.json whenever writable so publishing carries edits automatically
  if (syncProductsSeed) {
    try {
      fs.writeFileSync(DEFAULT_PRODUCTS_PATH, JSON.stringify(storeState.products, null, 2) + '\n', 'utf8');
    } catch (err) {
      console.warn('Could not mirror products to src/data/products.json:', err);
    }
  }
}

function broadcastStoreUpdate(reason: string): void {
  const payload = JSON.stringify({
    reason,
    products: storeState.products,
    orders: storeState.orders,
    adminNotes: storeState.adminNotes,
    mediaFolders: storeState.mediaFolders,
    updatedAt: storeState.updatedAt
  });

  for (const client of sseClients) {
    try {
      client.write(`event: store-update\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const passkey = req.header('x-admin-passkey');
  if (passkey !== ADMIN_PASSKEY) {
    res.status(401).json({ error: 'Unauthorized: invalid admin passkey' });
    return;
  }
  next();
}

async function startServer(): Promise<void> {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  // Serve uploaded product images cleanly in both dev & production (with bundled fallbacks)
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
  const publicUploadsDir = path.join(ROOT_DIR, 'public', 'uploads');
  if (UPLOADS_DIR !== publicUploadsDir && fs.existsSync(publicUploadsDir)) {
    app.use('/uploads', express.static(publicUploadsDir, { maxAge: '7d' }));
  }
  const distUploadsDir = path.join(DIST_DIR, 'uploads');
  if (fs.existsSync(distUploadsDir)) {
    app.use('/uploads', express.static(distUploadsDir, { maxAge: '7d' }));
  }

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, updatedAt: storeState.updatedAt });
  });

  // Verify admin passkey server-side without exposing passkey in client UI
  app.post('/api/admin/verify', (req: Request, res: Response) => {
    const bodyPasskey = typeof req.body?.passkey === 'string' ? req.body.passkey : '';
    const headerPasskey = req.header('x-admin-passkey') || '';
    const candidate = bodyPasskey || headerPasskey;
    if (candidate === ADMIN_PASSKEY) {
      res.json({ ok: true });
      return;
    }
    res.status(401).json({ error: 'Invalid administrator passkey' });
  });

  // Read full live storefront state
  app.get('/api/store', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      products: storeState.products,
      orders: storeState.orders,
      adminNotes: storeState.adminNotes,
      mediaFolders: storeState.mediaFolders,
      updatedAt: storeState.updatedAt
    });
  });

  // Live Server-Sent Events stream for automatic website updates
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(
      `event: connected\ndata: ${JSON.stringify({ updatedAt: storeState.updatedAt })}\n\n`
    );

    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  function saveDataUrlToUploads(dataUrl: string, filename?: string): string {
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
    if (!match) {
      throw new Error('UNSUPPORTED_FORMAT');
    }

    const rawExt = match[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error('TOO_LARGE');
    }

    const safeBase = (filename || 'product')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .toLowerCase()
      .slice(0, 40) || 'product';
    const uniqueName = `${safeBase}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    const destPath = path.join(UPLOADS_DIR, uniqueName);

    fs.writeFileSync(destPath, buffer);
    return `/uploads/${uniqueName}`;
  }

  function cleanupUnusedUpload(url: string): void {
    if (!url || !url.startsWith('/uploads/')) return;
    const isStillUsedByProduct = storeState.products.some(
      (p) => p.image === url || (Array.isArray(p.gallery) && p.gallery.includes(url))
    );
    const isStillUsedByFolder = storeState.mediaFolders.some((f) =>
      f.images.some((img) => img.url === url)
    );
    if (isStillUsedByProduct || isStillUsedByFolder) return;

    const filename = path.basename(url);
    const targetPath = path.join(UPLOADS_DIR, filename);
    if (targetPath.startsWith(UPLOADS_DIR) && fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (err) {
        console.warn('Could not delete unused upload file:', err);
      }
    }
  }

  // Upload product image to persistent uploads folder
  app.post('/api/upload', requireAdmin, (req: Request, res: Response) => {
    try {
      const { dataUrl, filename } = req.body as { dataUrl?: string; filename?: string };
      if (!dataUrl || typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Missing image dataUrl' });
        return;
      }

      const url = saveDataUrlToUploads(dataUrl, filename);
      res.json({ url });
    } catch (err) {
      if (err instanceof Error && err.message === 'UNSUPPORTED_FORMAT') {
        res.status(400).json({ error: 'Unsupported image format' });
        return;
      }
      if (err instanceof Error && err.message === 'TOO_LARGE') {
        res.status(413).json({ error: 'Image too large (max 10MB)' });
        return;
      }
      console.error('Image upload error:', err);
      res.status(500).json({ error: 'Failed to save uploaded image' });
    }
  });

  // Create a new image folder
  app.post('/api/media/folders', requireAdmin, (req: Request, res: Response) => {
    try {
      const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      if (!rawName) {
        res.status(400).json({ error: 'Folder name is required' });
        return;
      }

      const existing = storeState.mediaFolders.find(
        (f) => f.name.toLowerCase() === rawName.toLowerCase()
      );
      if (existing) {
        res.json({
          folder: existing,
          mediaFolders: storeState.mediaFolders,
          updatedAt: storeState.updatedAt
        });
        return;
      }

      const slug = rawName
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32) || 'folder';

      const newFolder: MediaFolder = {
        id: `folder-${slug}-${Date.now().toString().slice(-4)}`,
        name: rawName,
        images: [],
        createdAt: Date.now()
      };

      storeState.mediaFolders = [newFolder, ...storeState.mediaFolders];
      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.status(201).json({
        folder: newFolder,
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Create media folder error:', err);
      res.status(500).json({ error: 'Failed to create image folder' });
    }
  });

  // Delete an image folder
  app.delete('/api/media/folders/:folderId', requireAdmin, (req: Request, res: Response) => {
    try {
      const { folderId } = req.params;
      const targetFolder = storeState.mediaFolders.find((f) => f.id === folderId);
      if (!targetFolder) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      storeState.mediaFolders = storeState.mediaFolders.filter((f) => f.id !== folderId);
      for (const img of targetFolder.images) {
        cleanupUnusedUpload(img.url);
      }

      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.json({
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Delete media folder error:', err);
      res.status(500).json({ error: 'Failed to delete image folder' });
    }
  });

  // Add one or multiple images to a specific folder
  app.post('/api/media/folders/:folderId/images', requireAdmin, (req: Request, res: Response) => {
    try {
      const { folderId } = req.params;
      const folderIdx = storeState.mediaFolders.findIndex((f) => f.id === folderId);
      if (folderIdx < 0) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      const body = req.body as {
        dataUrl?: string;
        filename?: string;
        url?: string;
        items?: Array<{ dataUrl?: string; filename?: string; url?: string }>;
      };

      const rawItems = Array.isArray(body?.items)
        ? body.items
        : body?.dataUrl || body?.url
          ? [{ dataUrl: body.dataUrl, filename: body.filename, url: body.url }]
          : [];

      if (rawItems.length === 0) {
        res.status(400).json({ error: 'No image data provided' });
        return;
      }

      const addedImages: MediaFolderImage[] = [];
      for (const item of rawItems) {
        let resolvedUrl = '';
        if (typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')) {
          resolvedUrl = saveDataUrlToUploads(item.dataUrl, item.filename);
        } else if (typeof item.url === 'string' && item.url.trim()) {
          resolvedUrl = item.url.trim();
        } else {
          continue;
        }

        const displayName = (item.filename || 'Uploaded Image')
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .trim() || 'Product Photo';

        addedImages.push({
          id: `img-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          name: displayName,
          url: resolvedUrl,
          createdAt: Date.now()
        });
      }

      if (addedImages.length === 0) {
        res.status(400).json({ error: 'No valid images in request' });
        return;
      }

      const target = storeState.mediaFolders[folderIdx];
      const updatedFolder: MediaFolder = {
        ...target,
        images: [...addedImages, ...target.images]
      };
      storeState.mediaFolders = storeState.mediaFolders.map((f, idx) =>
        idx === folderIdx ? updatedFolder : f
      );

      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.status(201).json({
        folder: updatedFolder,
        addedImages,
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'UNSUPPORTED_FORMAT') {
        res.status(400).json({ error: 'Unsupported image format' });
        return;
      }
      if (err instanceof Error && err.message === 'TOO_LARGE') {
        res.status(413).json({ error: 'Image too large (max 10MB)' });
        return;
      }
      console.error('Add folder images error:', err);
      res.status(500).json({ error: 'Failed to add images to folder' });
    }
  });

  // Clear all images inside a folder without deleting the folder itself
  app.delete('/api/media/folders/:folderId/images', requireAdmin, (req: Request, res: Response) => {
    try {
      const { folderId } = req.params;
      const folderIdx = storeState.mediaFolders.findIndex((f) => f.id === folderId);
      if (folderIdx < 0) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      const targetFolder = storeState.mediaFolders[folderIdx];
      const removedImages = [...targetFolder.images];
      const updatedFolder: MediaFolder = {
        ...targetFolder,
        images: []
      };

      storeState.mediaFolders = storeState.mediaFolders.map((f, idx) =>
        idx === folderIdx ? updatedFolder : f
      );

      for (const img of removedImages) {
        cleanupUnusedUpload(img.url);
      }

      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.json({
        folder: updatedFolder,
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Clear folder images error:', err);
      res.status(500).json({ error: 'Failed to clear folder images' });
    }
  });

  // Delete a single image from a folder
  app.delete('/api/media/folders/:folderId/images/:imageId', requireAdmin, (req: Request, res: Response) => {
    try {
      const { folderId, imageId } = req.params;
      const folderIdx = storeState.mediaFolders.findIndex((f) => f.id === folderId);
      if (folderIdx < 0) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      const targetFolder = storeState.mediaFolders[folderIdx];
      const targetImage = targetFolder.images.find((img) => img.id === imageId);
      if (!targetImage) {
        res.status(404).json({ error: 'Image not found in folder' });
        return;
      }

      const updatedFolder: MediaFolder = {
        ...targetFolder,
        images: targetFolder.images.filter((img) => img.id !== imageId)
      };

      storeState.mediaFolders = storeState.mediaFolders.map((f, idx) =>
        idx === folderIdx ? updatedFolder : f
      );

      cleanupUnusedUpload(targetImage.url);
      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.json({
        folder: updatedFolder,
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Delete folder image error:', err);
      res.status(500).json({ error: 'Failed to delete image from folder' });
    }
  });

  // Update existing product (price, image, gallery, stock, etc.)
  app.put('/api/products/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const incoming = req.body as StoredProduct;
      if (!incoming || !incoming.id || !incoming.name) {
        res.status(400).json({ error: 'Invalid product payload' });
        return;
      }

      const existingIdx = storeState.products.findIndex((p) => p.id === id);
      if (existingIdx >= 0) {
        storeState.products[existingIdx] = incoming;
      } else {
        storeState.products.unshift(incoming);
      }

      persistStore(true);
      broadcastStoreUpdate('product-updated');

      res.json({
        product: incoming,
        products: storeState.products,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Product update error:', err);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  // Create new product
  app.post('/api/products', requireAdmin, (req: Request, res: Response) => {
    try {
      const incoming = req.body as StoredProduct;
      if (!incoming || !incoming.id || !incoming.name) {
        res.status(400).json({ error: 'Invalid product payload' });
        return;
      }

      const deduped = storeState.products.filter((p) => p.id !== incoming.id);
      storeState.products = [incoming, ...deduped];

      persistStore(true);
      broadcastStoreUpdate('product-added');

      res.status(201).json({
        product: incoming,
        products: storeState.products,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Product create error:', err);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  // Delete product
  app.delete('/api/products/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      storeState.products = storeState.products.filter((p) => p.id !== id);

      persistStore(true);
      broadcastStoreUpdate('product-deleted');

      res.json({
        products: storeState.products,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Product delete error:', err);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  // Create customer order
  app.post('/api/orders', (req: Request, res: Response) => {
    try {
      const order = req.body as StoredOrder;
      if (!order || !order.id) {
        res.status(400).json({ error: 'Invalid order payload' });
        return;
      }

      storeState.orders = [order, ...storeState.orders.filter((o) => o.id !== order.id)];
      persistStore(false);
      broadcastStoreUpdate('order-created');

      res.status(201).json({ order, updatedAt: storeState.updatedAt });
    } catch (err) {
      console.error('Order create error:', err);
      res.status(500).json({ error: 'Failed to save order' });
    }
  });

  // Update order status / tracking / admin note
  app.put('/api/orders/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, trackingNumber, note } = req.body as {
        status?: StoredOrder['status'];
        trackingNumber?: string;
        note?: string;
      };

      storeState.orders = storeState.orders.map((o) => {
        if (o.id !== id) return o;
        return {
          ...o,
          status: status || o.status,
          trackingNumber: trackingNumber !== undefined ? trackingNumber : o.trackingNumber
        };
      });

      if (note !== undefined) {
        storeState.adminNotes[id] = note;
      }

      persistStore(false);
      broadcastStoreUpdate('order-updated');

      res.json({
        orders: storeState.orders,
        adminNotes: storeState.adminNotes,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Order update error:', err);
      res.status(500).json({ error: 'Failed to update order' });
    }
  });

  // Delete order
  app.delete('/api/orders/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      storeState.orders = storeState.orders.filter((o) => o.id !== id);
      persistStore(false);
      broadcastStoreUpdate('order-deleted');

      res.json({ orders: storeState.orders, updatedAt: storeState.updatedAt });
    } catch (err) {
      console.error('Order delete error:', err);
      res.status(500).json({ error: 'Failed to delete order' });
    }
  });

  // Update admin note for an order
  app.put('/api/admin-notes/:orderId', requireAdmin, (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const { note } = req.body as { note?: string };
      storeState.adminNotes[orderId] = note || '';
      persistStore(false);
      broadcastStoreUpdate('note-updated');
      res.json({ adminNotes: storeState.adminNotes, updatedAt: storeState.updatedAt });
    } catch (err) {
      console.error('Admin note update error:', err);
      res.status(500).json({ error: 'Failed to save admin note' });
    }
  });

  if (!isProduction) {
    // Serve a clean no-HMR client shim so Vite never opens failing WebSockets behind reverse proxies
    app.get('/@vite/client', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`const sheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const parsed = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (parsed.search ? '&' + parsed.search.slice(1) : '') + (parsed.hash || '');
}
export class ErrorOverlay {}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(DIST_DIR, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        }
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    console.error('Unhandled request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Banaya Enterprises server running on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
