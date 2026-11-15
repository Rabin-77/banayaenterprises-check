import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Product, CartItem, Order, ActiveModal, MediaFolder, MediaFolderImage } from '../types';
import { PRODUCTS } from '../data/products';
import { DEFAULT_MEDIA_FOLDERS } from '../data/defaultMediaFolders';
import { getPriceForProductWeight } from '../utils/pricing';
import { clearAdminSession, getAdminSessionPasskey } from '../utils/adminAuth';
import { healLegacyProductImages } from '../utils/imageFallback';
import { sortCatalogByCanonicalOrder } from '../utils/catalogOrder';
import { optimizeImageToDataUrl } from '../utils/imageUpload';

const SYNC_CHANNEL_NAME = 'banaya_store_sync';
const CATALOG_VERSION_KEY = 'banaya_catalog_version';
const CURRENT_CATALOG_VERSION = '2026-11-15-static-images-v6';

interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
  productImage?: string;
}

interface StoreSyncPayload {
  products?: Product[];
  orders?: Order[];
  adminNotes?: Record<string, string>;
  mediaFolders?: MediaFolder[];
  updatedAt?: number;
}

interface ShopContextType {
  products: Product[];
  cart: CartItem[];
  wishlist: string[];
  orders: Order[];
  activeModal: ActiveModal;
  selectedProduct: Product | null;
  searchQuery: string;
  selectedCategory: string;
  sortBy: string;
  toasts: ToastMessage[];
  appliedCoupon: { code: string; discountPercent: number; discountFixed: number } | null;
  serverSynced: boolean;
  lastSyncedAt: number | null;

  // Actions
  setActiveModal: (modal: ActiveModal) => void;
  setSelectedProduct: (product: Product | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string) => void;
  setSortBy: (sort: string) => void;

  // Cart Actions
  addToCart: (product: Product, quantity?: number, weight?: string) => void;
  removeFromCart: (productId: string, weight: string) => void;
  updateQuantity: (productId: string, weight: string, quantity: number) => void;
  clearCart: () => void;
  applyCoupon: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;

  // Wishlist Actions
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;

  // Order Actions
  placeOrder: (orderDetails: {
    customerName: string;
    phone: string;
    email: string;
    shippingAddress: string;
    city: string;
    postalCode: string;
    paymentMethod: string;
    transactionId?: string;
    bankRef?: string;
  }) => Order;
  trackOrderById: (orderId: string) => Order | null;

  // Toast
  showToast: (title: string, message: string, type?: 'success' | 'info' | 'warning', productImage?: string) => void;
  dismissToast: (id: string) => void;

  // Quick View / Detail Navigation
  openProductDetail: (product: Product) => void;
  openQuickCheckout: (product: Product, weight?: string) => void;
  trackingLookupId: string;
  setTrackingLookupId: (orderId: string) => void;
  openOrderTracking: (orderId: string) => void;

  // Product Management (Admin)
  updateProduct: (updatedProduct: Product) => Promise<boolean>;
  addProduct: (newProduct: Product) => Promise<boolean>;
  deleteProduct: (productId: string) => Promise<boolean>;

  // Media Folders Management (Admin)
  mediaFolders: MediaFolder[];
  createMediaFolder: (name: string) => Promise<MediaFolder | null>;
  deleteMediaFolder: (folderId: string) => Promise<boolean>;
  clearMediaFolder: (folderId: string) => Promise<boolean>;
  addImagesToFolder: (folderId: string, files: File[]) => Promise<MediaFolderImage[]>;
  uploadLocalDirectoryAsFolder: (files: File[], fallbackFolderName?: string) => Promise<MediaFolder | null>;
  deleteImageFromFolder: (folderId: string, imageId: string) => Promise<boolean>;

  // Order & Customer Management (Admin)
  updateOrderStatus: (orderId: string, status: Order['status'], trackingNumber?: string, adminNotes?: string) => void;
  deleteOrder: (orderId: string) => void;
  adminNotes?: Record<string, string>;
  setAdminNotesForOrder: (orderId: string, note: string) => void;

  // Financial Calculations
  getEffectivePrice: (item: CartItem) => number;
  cartCount: number;
  cartSubtotal: number;
  cartDiscount: number;
  cartShipping: number;
  cartTotal: number;
  freeShippingThreshold: number;
  freeShippingRemaining: number;
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initial catalog state (quickly hydrated by server /api/store on mount)
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const version = localStorage.getItem(CATALOG_VERSION_KEY);
      const saved = localStorage.getItem('banaya_products');
      if (version === CURRENT_CATALOG_VERSION && saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sortCatalogByCanonicalOrder((parsed as Product[]).map(healLegacyProductImages));
        }
      }
      localStorage.setItem(CATALOG_VERSION_KEY, CURRENT_CATALOG_VERSION);
    } catch {
      // ignore localStorage read issues
    }
    return sortCatalogByCanonicalOrder(PRODUCTS.map(healLegacyProductImages));
  });

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [selectedProductState, setSelectedProductState] = useState<Product | null>(null);
  const [trackingLookupId, setTrackingLookupId] = useState<string>('STM-84920');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('featured');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number; discountFixed: number } | null>(null);
  const [serverSynced, setServerSynced] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Persistence for Cart
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('startone_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persistence for Wishlist
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('startone_wishlist');
      return saved ? JSON.parse(saved) : ['malai-thean', 'desi-cow-ghee', 'abc-malt'];
    } catch {
      return ['malai-thean', 'desi-cow-ghee', 'abc-malt'];
    }
  });

  // Persistence for Orders
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('startone_orders');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    const byId = (id: string, fallbackIdx: number) =>
      PRODUCTS.find(p => p.id === id) || PRODUCTS[fallbackIdx] || PRODUCTS[0];

    if (PRODUCTS.length === 0) return [];

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
  });

  // Admin notes persistence
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('banaya_admin_notes');
      return saved ? JSON.parse(saved) : {
        'STM-84920': 'Delivered via DTDC Courier. Customer praised Honey aroma.',
        'STM-85104': 'Customer requested fresh batch honey jar. Verified via WhatsApp.',
        'STM-85219': 'Joint pain soup ordered for elderly parents. Shipped priority.'
      };
    } catch {
      return {};
    }
  });

  // Media Folders persistence
  const [mediaFolders, setMediaFolders] = useState<MediaFolder[]>(() => {
    try {
      const saved = localStorage.getItem('banaya_media_folders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed as MediaFolder[];
        }
      }
    } catch {
      // ignore localStorage read issues
    }
    return DEFAULT_MEDIA_FOLDERS;
  });

  const applyServerSnapshot = useCallback((payload: StoreSyncPayload) => {
    if (Array.isArray(payload.products) && payload.products.length > 0) {
      setProducts(sortCatalogByCanonicalOrder(payload.products.map(healLegacyProductImages)));
    }
    if (Array.isArray(payload.orders)) {
      setOrders(payload.orders);
    }
    if (payload.adminNotes && typeof payload.adminNotes === 'object') {
      setAdminNotes(payload.adminNotes);
    }
    if (Array.isArray(payload.mediaFolders)) {
      setMediaFolders(payload.mediaFolders);
    }
    setServerSynced(true);
    setLastSyncedAt(payload.updatedAt || Date.now());
  }, []);

  const fetchServerStore = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`/api/store?_t=${Date.now()}`, { cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = (await response.json()) as StoreSyncPayload;
        applyServerSnapshot(data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [applyServerSnapshot]);

  // Initial server hydration + real-time SSE + cross-tab BroadcastChannel sync
  useEffect(() => {
    let isCancelled = false;
    let eventSource: EventSource | null = null;
    let syncTimer: number | null = null;

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      broadcastChannelRef.current = channel;
      channel.onmessage = (event: MessageEvent<StoreSyncPayload>) => {
        if (event.data) {
          applyServerSnapshot(event.data);
        }
      };
    }

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void fetchServerStore();
      }
    };

    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === 'banaya_products' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProducts(sortCatalogByCanonicalOrder((parsed as Product[]).map(healLegacyProductImages)));
          }
        } catch {
          // ignore malformed storage value
        }
      }
    };

    window.addEventListener('storage', handleStorageSync);

    void fetchServerStore().then((hasBackend) => {
      if (isCancelled || !hasBackend) return;

      if (typeof EventSource !== 'undefined') {
        eventSource = new EventSource('/api/events');
        eventSource.addEventListener('connected', () => {
          setServerSynced(true);
        });
        eventSource.addEventListener('store-update', (event: MessageEvent) => {
          try {
            const parsed = JSON.parse(event.data) as StoreSyncPayload;
            applyServerSnapshot(parsed);
          } catch {
            // ignore malformed SSE chunk
          }
        });
        eventSource.onerror = () => {
          setServerSynced(false);
        };
      }

      // Fallback sync every 15s when tab is active
      syncTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          void fetchServerStore();
        }
      }, 15000);

      window.addEventListener('focus', handleVisibilityOrFocus);
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    });

    return () => {
      isCancelled = true;
      eventSource?.close();
      broadcastChannelRef.current?.close();
      if (syncTimer !== null) {
        window.clearInterval(syncTimer);
      }
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('storage', handleStorageSync);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [fetchServerStore, applyServerSnapshot]);

  // Local cache fallback (never crashes if quota exceeded)
  useEffect(() => {
    try {
      localStorage.setItem('banaya_products', JSON.stringify(products));
    } catch {
      // Ignore quota errors cleanly since server holds authoritative catalog
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem('banaya_admin_notes', JSON.stringify(adminNotes));
    } catch {
      // ignore
    }
  }, [adminNotes]);

  useEffect(() => {
    try {
      localStorage.setItem('banaya_media_folders', JSON.stringify(mediaFolders));
    } catch {
      // ignore quota errors
    }
  }, [mediaFolders]);

  useEffect(() => {
    try {
      localStorage.setItem('startone_cart', JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem('startone_wishlist', JSON.stringify(wishlist));
    } catch {
      // ignore
    }
  }, [wishlist]);

  useEffect(() => {
    try {
      localStorage.setItem('startone_orders', JSON.stringify(orders));
    } catch {
      // ignore
    }
  }, [orders]);

  // Keep cart item product snapshots synchronized whenever admin edits prices/images
  useEffect(() => {
    setCart((prevCart) => {
      let changed = false;
      const nextCart = prevCart.map((item) => {
        const latest = products.find((p) => p.id === item.product.id);
        if (
          latest &&
          (latest.price !== item.product.price ||
            latest.originalPrice !== item.product.originalPrice ||
            latest.image !== item.product.image ||
            latest.name !== item.product.name)
        ) {
          changed = true;
          return { ...item, product: latest };
        }
        return item;
      });
      return changed ? nextCart : prevCart;
    });
  }, [products]);

  // Always derive selectedProduct from latest products array so edits update open/reopened detail views automatically
  const selectedProduct = useMemo(() => {
    if (!selectedProductState) return null;
    return products.find((p) => p.id === selectedProductState.id) || selectedProductState;
  }, [selectedProductState, products]);

  const setSelectedProduct = (product: Product | null) => {
    setSelectedProductState(product);
  };

  const showToast = (title: string, message: string, type: 'success' | 'info' | 'warning' = 'success', productImage?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev.slice(-3), { id, title, message, type, productImage }]);
    setTimeout(() => {
      dismissToast(id);
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const addToCart = (product: Product, quantity = 1, weight?: string) => {
    const latest = products.find(p => p.id === product.id) || product;
    if (!latest.inStock) {
      showToast('Out of Stock', `${latest.name} is currently out of stock.`, 'warning', latest.image);
      return;
    }
    const selectedWeight = weight || latest.defaultWeight;

    setCart(prev => {
      const existingIndex = prev.findIndex(item => item.product.id === latest.id && item.selectedWeight === selectedWeight);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity
        };
        return updated;
      }
      return [...prev, { product: latest, quantity, selectedWeight }];
    });

    showToast('Added to Cart', `${latest.name} (${selectedWeight}) has been added to your bag.`, 'success', latest.image);
  };

  const removeFromCart = (productId: string, weight: string) => {
    setCart(prev => prev.filter(item => !(item.product.id === productId && item.selectedWeight === weight)));
    showToast('Removed', 'Item was removed from your bag.', 'info');
  };

  const updateQuantity = (productId: string, weight: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId, weight);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId && item.selectedWeight === weight
          ? { ...item, quantity }
          : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const toggleWishlist = (productId: string) => {
    const product = products.find(p => p.id === productId);
    setWishlist(prev => {
      const exists = prev.includes(productId);
      if (exists) {
        showToast('Removed from Wishlist', `${product?.name || 'Item'} was removed from your wishlist.`, 'info');
        return prev.filter(id => id !== productId);
      } else {
        showToast('Saved to Wishlist', `${product?.name || 'Item'} added to your wishlist.`, 'success', product?.image);
        return [...prev, productId];
      }
    });
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  const applyCoupon = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode === 'BANAYANA10' || cleanCode === 'STARTONE10') {
      setAppliedCoupon({ code: cleanCode, discountPercent: 10, discountFixed: 0 });
      showToast('Coupon Applied!', '10% discount applied to your order.', 'success');
      return { success: true, message: '10% OFF coupon applied successfully!' };
    }
    if (cleanCode === 'NATURAL15') {
      if (cartSubtotal < 999) {
        return { success: false, message: 'NATURAL15 requires a minimum order of ₹999' };
      }
      setAppliedCoupon({ code: 'NATURAL15', discountPercent: 15, discountFixed: 0 });
      showToast('Coupon Applied!', '15% discount applied to your order.', 'success');
      return { success: true, message: '15% OFF coupon applied successfully!' };
    }
    if (cleanCode === 'FREESHIP') {
      setAppliedCoupon({ code: 'FREESHIP', discountPercent: 0, discountFixed: 0 });
      showToast('Coupon Applied!', 'Free shipping voucher applied.', 'success');
      return { success: true, message: 'Free shipping voucher applied!' };
    }
    return { success: false, message: 'Invalid coupon code. Try BANAYANA10 or NATURAL15' };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    showToast('Coupon Removed', 'Promo code removed from cart.', 'info');
  };

  const openProductDetail = (product: Product) => {
    setSelectedProductState(product);
    setActiveModal('quickView');
  };

  const openQuickCheckout = (product: Product, weight?: string) => {
    const latest = products.find(p => p.id === product.id) || product;
    if (!latest.inStock) {
      showToast('Out of Stock', `${latest.name} is currently out of stock.`, 'warning', latest.image);
      return;
    }
    addToCart(latest, 1, weight);
    setActiveModal('checkout');
  };

  const openOrderTracking = (orderId: string) => {
    setTrackingLookupId(orderId);
    setActiveModal('trackOrder');
  };

  // Calculations
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const getEffectivePrice = (item: CartItem) => {
    const latest = products.find(p => p.id === item.product.id) || item.product;
    return getPriceForProductWeight(latest, item.selectedWeight).price;
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + getEffectivePrice(item) * item.quantity, 0);

  const freeShippingThreshold = 499;
  const isFreeShippingByValue = cartSubtotal >= freeShippingThreshold;
  const isFreeShippingByCoupon = appliedCoupon?.code === 'FREESHIP';
  const cartShipping = cartSubtotal === 0 || isFreeShippingByValue || isFreeShippingByCoupon ? 0 : 60;

  let cartDiscount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountPercent > 0) {
      cartDiscount = Math.round((cartSubtotal * appliedCoupon.discountPercent) / 100);
    } else if (appliedCoupon.discountFixed > 0 && !isFreeShippingByValue) {
      cartDiscount = appliedCoupon.discountFixed;
    }
  }

  const cartTotal = Math.max(0, cartSubtotal - cartDiscount + cartShipping);
  const freeShippingRemaining = Math.max(0, freeShippingThreshold - cartSubtotal);

  const placeOrder = (details: {
    customerName: string;
    phone: string;
    email: string;
    shippingAddress: string;
    city: string;
    postalCode: string;
    paymentMethod: string;
    transactionId?: string;
    bankRef?: string;
  }): Order => {
    const orderNumber = Math.floor(10000 + Math.random() * 90000);
    const trackingCode = `BNY${Math.floor(10000000 + Math.random() * 90000000)}IN`;
    const txnId = details.transactionId || `TXN-BNY-${Date.now().toString().slice(-6)}`;
    const bankRef = details.bankRef || `SBI${Math.floor(100000000000 + Math.random() * 900000000000)}`;

    const newOrder: Order = {
      id: `BNY-${orderNumber}`,
      date: new Date().toISOString().split('T')[0],
      items: [...cart],
      subtotal: cartSubtotal,
      discount: cartDiscount,
      shipping: cartShipping,
      totalAmount: cartTotal,
      status: 'Confirmed',
      customerName: details.customerName,
      phone: details.phone,
      email: details.email,
      shippingAddress: details.shippingAddress,
      city: details.city,
      postalCode: details.postalCode,
      paymentMethod: details.paymentMethod,
      trackingNumber: trackingCode,
      transactionId: txnId,
      bankRef: bankRef
    };

    setOrders(prev => [newOrder, ...prev]);
    clearCart();
    setAppliedCoupon(null);

    // Sync new order to live server store
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder)
    }).catch(() => {
      // ignore if offline
    });

    return newOrder;
  };

  const trackOrderById = (orderId: string): Order | null => {
    const cleanId = orderId.trim().toUpperCase();
    return orders.find(o => o.id.toUpperCase() === cleanId || o.trackingNumber.toUpperCase() === cleanId) || null;
  };

  // Product Management (Admin) -> Authoritative Server Sync + Cross-Tab Broadcast
  const updateProduct = async (updatedProduct: Product): Promise<boolean> => {
    const healed = healLegacyProductImages(updatedProduct);
    const prevProducts = products;
    const exists = prevProducts.some(p => p.id === healed.id);
    const nextProducts = sortCatalogByCanonicalOrder(
      exists
        ? prevProducts.map(p => (p.id === healed.id ? healed : p))
        : [healed, ...prevProducts]
    );
    setProducts(nextProducts);

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(healed.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passkey': getAdminSessionPasskey()
        },
        body: JSON.stringify(healed)
      });

      if (res.ok) {
        const data = (await res.json()) as StoreSyncPayload;
        applyServerSnapshot(data);
        broadcastChannelRef.current?.postMessage({ products: data.products, updatedAt: data.updatedAt });
        showToast(
          'Synced Live to Website',
          `${healed.name} (₹${healed.price}) is now live across the store.`,
          'success',
          healed.image
        );
        return true;
      }

      if (res.status === 401) {
        clearAdminSession();
        setProducts(prevProducts);
        showToast(
          'Admin Verification Required',
          'Your admin session expired. Please sign out and re-enter passkey to save changes.',
          'warning'
        );
        return false;
      }

      let serverErr = `Server returned HTTP ${res.status}`;
      try {
        const errBody = (await res.json()) as { error?: string };
        if (errBody?.error) serverErr = errBody.error;
      } catch {
        // ignore JSON parse error
      }
      setProducts(prevProducts);
      setServerSynced(false);
      showToast('Live Sync Warning', `${healed.name} could not be saved to server (${serverErr}).`, 'warning');
      return false;
    } catch {
      setServerSynced(false);
      broadcastChannelRef.current?.postMessage({ products: nextProducts, updatedAt: Date.now() });
      showToast('Saved in Browser Only', `Server unreachable — ${healed.name} updated in this browser only.`, 'warning', healed.image);
      return true;
    }
  };

  const addProduct = async (newProduct: Product): Promise<boolean> => {
    const healed = healLegacyProductImages(newProduct);
    const prevProducts = products;
    const nextProducts = sortCatalogByCanonicalOrder([
      healed,
      ...prevProducts.filter(p => p.id !== healed.id)
    ]);
    setProducts(nextProducts);

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passkey': getAdminSessionPasskey()
        },
        body: JSON.stringify(healed)
      });

      if (res.ok) {
        const data = (await res.json()) as StoreSyncPayload;
        applyServerSnapshot(data);
        broadcastChannelRef.current?.postMessage({ products: data.products, updatedAt: data.updatedAt });
        showToast('Launched Live to Website', `${healed.name} is now live in the storefront catalog.`, 'success', healed.image);
        return true;
      }

      if (res.status === 401) {
        clearAdminSession();
        setProducts(prevProducts);
        showToast(
          'Admin Verification Required',
          'Your admin session expired. Please sign out and re-enter passkey to launch this product.',
          'warning'
        );
        return false;
      }

      let serverErr = `Server returned HTTP ${res.status}`;
      try {
        const errBody = (await res.json()) as { error?: string };
        if (errBody?.error) serverErr = errBody.error;
      } catch {
        // ignore
      }
      setProducts(prevProducts);
      setServerSynced(false);
      showToast('Live Sync Warning', `${healed.name} could not be saved to server (${serverErr}).`, 'warning');
      return false;
    } catch {
      setServerSynced(false);
      broadcastChannelRef.current?.postMessage({ products: nextProducts, updatedAt: Date.now() });
      showToast('Saved in Browser Only', `Server unreachable — ${healed.name} added in this browser only.`, 'warning', healed.image);
      return true;
    }
  };

  const deleteProduct = async (productId: string): Promise<boolean> => {
    const prod = products.find(p => p.id === productId);
    const prevProducts = products;
    const nextProducts = prevProducts.filter(p => p.id !== productId);
    setProducts(nextProducts);

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-passkey': getAdminSessionPasskey()
        }
      });

      if (res.ok) {
        const data = (await res.json()) as StoreSyncPayload;
        applyServerSnapshot(data);
        broadcastChannelRef.current?.postMessage({ products: data.products, updatedAt: data.updatedAt });
        showToast('Removed from Live Store', `${prod?.name || 'Product'} removed from live website.`, 'info');
        return true;
      }

      if (res.status === 401) {
        clearAdminSession();
        setProducts(prevProducts);
        showToast('Admin Verification Required', 'Please sign out and re-enter admin passkey to delete products.', 'warning');
        return false;
      }

      setProducts(prevProducts);
      setServerSynced(false);
      showToast('Live Sync Warning', `Could not remove ${prod?.name || 'product'} from server.`, 'warning');
      return false;
    } catch {
      setServerSynced(false);
      broadcastChannelRef.current?.postMessage({ products: nextProducts, updatedAt: Date.now() });
      showToast('Removed in Browser Only', `Server unreachable — ${prod?.name || 'Product'} removed locally only.`, 'warning');
      return true;
    }
  };

  // Media Folders Management (Admin)
  const createMediaFolder = async (name: string): Promise<MediaFolder | null> => {
    const cleanName = name.trim();
    if (!cleanName) return null;

    const existingLocal = mediaFolders.find(
      f => f.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (existingLocal) {
      showToast('Folder Ready', `Using existing folder "${existingLocal.name}".`, 'info');
      return existingLocal;
    }

    const fallbackFolder: MediaFolder = {
      id: `folder-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28) || 'custom'}-${Date.now().toString().slice(-4)}`,
      name: cleanName,
      images: [],
      createdAt: Date.now()
    };

    try {
      const res = await fetch('/api/media/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passkey': getAdminSessionPasskey()
        },
        body: JSON.stringify({ name: cleanName })
      });

      if (res.ok) {
        const data = (await res.json()) as StoreSyncPayload & { folder?: MediaFolder };
        applyServerSnapshot(data);
        broadcastChannelRef.current?.postMessage({ mediaFolders: data.mediaFolders, updatedAt: data.updatedAt });
        showToast('Folder Created', `"${data.folder?.name || cleanName}" added to Image Folders.`, 'success');
        return data.folder || fallbackFolder;
      }

      if (res.status === 401) {
        clearAdminSession();
        showToast('Admin Verification Required', 'Please sign out and re-enter admin passkey to create folders.', 'warning');
        return null;
      }
    } catch {
      // fallback to local mode when offline
    }

    setMediaFolders(prev => [fallbackFolder, ...prev]);
    showToast('Folder Created', `"${cleanName}" created locally.`, 'success');
    return fallbackFolder;
  };

  const deleteMediaFolder = async (folderId: string): Promise<boolean> => {
    const target = mediaFolders.find(f => f.id === folderId);
    const prevFolders = mediaFolders;
    setMediaFolders(prev => prev.filter(f => f.id !== folderId));

    try {
      const res = await fetch(`/api/media/folders/${encodeURIComponent(folderId)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-passkey': getAdminSessionPasskey()
        }
      });

      if (res.ok) {
        const data = (await res.json()) as StoreSyncPayload;
        applyServerSnapshot(data);
        broadcastChannelRef.current?.postMessage({ mediaFolders: data.mediaFolders, updatedAt: data.updatedAt });
        showToast('Folder Deleted', `"${target?.name || 'Image folder'}" deleted cleanly.`, 'info');
        return true;
      }

      if (res.status === 401) {
        clearAdminSession();
        setMediaFolders(prevFolders);
        showToast('Admin Verification Required', 'Please sign out and re-enter admin passkey to delete folders.', 'warning');
        return false;
      }
    } catch {
      // ignore offline
    }

    showToast('Folder Deleted', `"${target?.name || 'Image folder'}" removed.`, 'info');
    return true;
  };

  const clearMediaFolder = async (folderId: string): Promise<boolean> => {
    const target = mediaFolders.find(f => f.id === folderId);
    const prevFolders = mediaFolders;
    setMediaFolders(prev => prev.map(f =>
      f.id === folderId ? { ...f, images: [] } : f
    ));

    try {
      const res = await fetch(`/api/media/folders/${encodeURIComponent(folderId)}/images`, {
        method: 'DELETE',
        headers: {
          'x-admin-passkey': getAdminSessionPasskey()
        }
      });

      if (res.ok) {
        const data = (await res.json()) as StoreSyncPayload;
        applyServerSnapshot(data);
        broadcastChannelRef.current?.postMessage({ mediaFolders: data.mediaFolders, updatedAt: data.updatedAt });
        showToast('Folder Cleared', `All images in "${target?.name || 'folder'}" have been cleared.`, 'info');
        return true;
      }

      if (res.status === 401) {
        clearAdminSession();
        setMediaFolders(prevFolders);
        showToast('Admin Verification Required', 'Please sign out and re-enter admin passkey to clear folders.', 'warning');
        return false;
      }
    } catch {
      // ignore offline
    }

    showToast('Folder Cleared', `All images in "${target?.name || 'folder'}" cleared.`, 'info');
    return true;
  };

  const addImagesToFolder = async (folderId: string, files: File[]): Promise<MediaFolderImage[]> => {
    const imageFiles = files
      .filter(file => {
        if (file.type && file.type.startsWith('image/')) return true;
        return /\.(png|jpe?g|webp|gif|jfif|bmp|avif)$/i.test(file.name);
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (imageFiles.length === 0) {
      showToast('No Images Found', 'Selected selection did not contain supported image files.', 'warning');
      return [];
    }

    const preparedItems: Array<{ dataUrl: string; filename: string }> = [];
    for (const file of imageFiles) {
      try {
        const optimizedDataUrl = await optimizeImageToDataUrl(file);
        preparedItems.push({ dataUrl: optimizedDataUrl, filename: file.name });
      } catch {
        // skip unreadable file
      }
    }

    if (preparedItems.length === 0) {
      showToast('Upload Failed', 'Could not read the selected image files.', 'warning');
      return [];
    }

    const uploadedItems: MediaFolderImage[] = [];
    const CHUNK_SIZE = 10;
    let offlineFallbackNeeded = false;

    for (let i = 0; i < preparedItems.length; i += CHUNK_SIZE) {
      const chunk = preparedItems.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch(`/api/media/folders/${encodeURIComponent(folderId)}/images`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-passkey': getAdminSessionPasskey()
          },
          body: JSON.stringify({ items: chunk })
        });

        if (res.ok) {
          const data = (await res.json()) as StoreSyncPayload & { addedImages?: MediaFolderImage[] };
          if (Array.isArray(data.mediaFolders)) {
            applyServerSnapshot(data);
            broadcastChannelRef.current?.postMessage({ mediaFolders: data.mediaFolders, updatedAt: data.updatedAt });
          }
          if (Array.isArray(data.addedImages)) {
            uploadedItems.push(...data.addedImages);
          }
          continue;
        }

        if (res.status === 401) {
          clearAdminSession();
          showToast('Admin Verification Required', 'Please sign out and re-enter admin passkey to upload images.', 'warning');
          return uploadedItems;
        }
      } catch {
        offlineFallbackNeeded = true;
      }

      if (offlineFallbackNeeded) {
        const localBatch: MediaFolderImage[] = chunk.map(item => ({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: item.filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Product Photo',
          url: item.dataUrl,
          createdAt: Date.now()
        }));
        uploadedItems.push(...localBatch);
        setMediaFolders(prev => prev.map(f =>
          f.id === folderId ? { ...f, images: [...localBatch, ...f.images] } : f
        ));
      }
    }

    if (uploadedItems.length > 0) {
      showToast(
        'Folder Images Added',
        `Added ${uploadedItems.length} ${uploadedItems.length === 1 ? 'image' : 'images'} to folder.`,
        'success',
        uploadedItems[0].url
      );
    } else {
      showToast('Upload Failed', 'Could not save the selected images.', 'warning');
    }

    return uploadedItems;
  };

  const uploadLocalDirectoryAsFolder = async (
    files: File[],
    fallbackFolderName?: string
  ): Promise<MediaFolder | null> => {
    const imageFiles = files.filter(file => {
      if (file.type && file.type.startsWith('image/')) return true;
      return /\.(png|jpe?g|webp|gif|jfif|bmp|avif)$/i.test(file.name);
    });

    if (imageFiles.length === 0) {
      showToast('No Images Found in Folder', 'Please select a folder containing JPG, PNG, or WEBP photos.', 'warning');
      return null;
    }

    // Group by product subfolder if the user selected a parent directory with multiple subfolders
    const groups = new Map<string, File[]>();
    for (const file of imageFiles) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      const parts = rel.split('/').filter(Boolean);
      const groupName =
        parts.length >= 3
          ? parts[parts.length - 2].trim()
          : parts.length === 2
            ? parts[0].trim()
            : (fallbackFolderName || `Product Photos ${new Date().toLocaleDateString('en-IN')}`);

      const list = groups.get(groupName) || [];
      list.push(file);
      groups.set(groupName, list);
    }

    let lastFolder: MediaFolder | null = null;
    const sortedGroupNames = Array.from(groups.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    for (const folderName of sortedGroupNames) {
      const folderFiles = groups.get(folderName) || [];
      if (folderFiles.length === 0) continue;

      const targetFolder = await createMediaFolder(folderName);
      if (!targetFolder) continue;

      await addImagesToFolder(targetFolder.id, folderFiles);
      lastFolder = targetFolder;
    }

    return lastFolder;
  };

  const deleteImageFromFolder = async (folderId: string, imageId: string): Promise<boolean> => {
    const prevFolders = mediaFolders;
    setMediaFolders(prev => prev.map(f =>
      f.id === folderId
        ? { ...f, images: f.images.filter(img => img.id !== imageId) }
        : f
    ));

    try {
      const res = await fetch(
        `/api/media/folders/${encodeURIComponent(folderId)}/images/${encodeURIComponent(imageId)}`,
        {
          method: 'DELETE',
          headers: {
            'x-admin-passkey': getAdminSessionPasskey()
          }
        }
      );

      if (res.ok) {
        const data = (await res.json()) as StoreSyncPayload;
        applyServerSnapshot(data);
        broadcastChannelRef.current?.postMessage({ mediaFolders: data.mediaFolders, updatedAt: data.updatedAt });
        showToast('Image Deleted', 'Photo removed from folder.', 'info');
        return true;
      }

      if (res.status === 401) {
        clearAdminSession();
        setMediaFolders(prevFolders);
        showToast('Admin Verification Required', 'Please sign out and re-enter admin passkey to delete images.', 'warning');
        return false;
      }
    } catch {
      // ignore offline
    }

    showToast('Image Deleted', 'Photo removed from folder.', 'info');
    return true;
  };

  // Order & Customer Management (Admin)
  const updateOrderStatus = (orderId: string, status: Order['status'], trackingNumber?: string, note?: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          status,
          trackingNumber: trackingNumber !== undefined ? trackingNumber : o.trackingNumber
        };
      }
      return o;
    }));

    if (note !== undefined) {
      setAdminNotes(prev => ({ ...prev, [orderId]: note }));
    }

    fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passkey': getAdminSessionPasskey()
      },
      body: JSON.stringify({ status, trackingNumber, note })
    }).catch(() => {
      // ignore if offline
    });

    showToast('Order Updated', `Order ${orderId} updated to status "${status}".`, 'success');
  };

  const deleteOrder = (orderId: string) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));

    fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
      headers: { 'x-admin-passkey': getAdminSessionPasskey() }
    }).catch(() => {
      // ignore if offline
    });

    showToast('Order Removed', `Order ${orderId} deleted from records.`, 'info');
  };

  const setAdminNotesForOrder = (orderId: string, note: string) => {
    setAdminNotes(prev => ({ ...prev, [orderId]: note }));

    fetch(`/api/admin-notes/${encodeURIComponent(orderId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passkey': getAdminSessionPasskey()
      },
      body: JSON.stringify({ note })
    }).catch(() => {
      // ignore if offline
    });
  };

  return (
    <ShopContext.Provider
      value={{
        products,
        cart,
        wishlist,
        orders,
        activeModal,
        selectedProduct,
        searchQuery,
        selectedCategory,
        sortBy,
        toasts,
        appliedCoupon,
        serverSynced,
        lastSyncedAt,
        setActiveModal,
        setSelectedProduct,
        setSearchQuery,
        setSelectedCategory,
        setSortBy,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        applyCoupon,
        removeCoupon,
        toggleWishlist,
        isInWishlist,
        placeOrder,
        trackOrderById,
        showToast,
        dismissToast,
        openProductDetail,
        openQuickCheckout,
        trackingLookupId,
        setTrackingLookupId,
        openOrderTracking,
        updateProduct,
        addProduct,
        deleteProduct,
        mediaFolders,
        createMediaFolder,
        deleteMediaFolder,
        clearMediaFolder,
        addImagesToFolder,
        uploadLocalDirectoryAsFolder,
        deleteImageFromFolder,
        updateOrderStatus,
        deleteOrder,
        adminNotes,
        setAdminNotesForOrder,
        getEffectivePrice,
        cartCount,
        cartSubtotal,
        cartDiscount,
        cartShipping,
        cartTotal,
        freeShippingThreshold,
        freeShippingRemaining
      }}
    >
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = () => {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
};
