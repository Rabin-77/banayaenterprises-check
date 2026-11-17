import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  ArrowRight,
  ArrowLeft,
  MessageCircle,
  Copy,
  Check,
  Lock,
  Clock,
  BadgeCheck,
  Building2,
  MapPin,
  Printer,
  Truck,
  ExternalLink,
  Loader2,
  Landmark,
  Download,
  FileText,
  BellRing,
  Mail
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useShop } from '../context/ShopContext';
import { Order } from '../types';
import {
  getOrderWhatsAppUrl,
  openWhatsAppUrl,
  DISPLAY_PHONE_NUMBER,
  BANAYA_UPI_ID
} from '../utils/whatsapp';
import { BANAYA_CONTACT_EMAIL } from '../config/storeContact';
import { getPriceForProductWeight } from '../utils/pricing';
import {
  downloadOrderReceipt,
  formatReceiptNumber,
  buildCustomerConfirmationMailtoUrl
} from '../utils/receipt';
import { handleProductImageError, handleProductImageLoad } from '../utils/imageFallback';

type PaymentOptionId = 'netbanking' | 'gpay' | 'phonepe' | 'paytm' | 'upi';

interface PaymentOptionConfig {
  id: PaymentOptionId;
  label: string;
  subtitle: string;
  tag?: string;
}

interface BankConfig {
  id: string;
  name: string;
  shortName: string;
  code: string;
  accentClass: string;
  portalUrl: string;
  popular: boolean;
}

const PAYMENT_OPTIONS: PaymentOptionConfig[] = [
  {
    id: 'netbanking',
    label: 'Net Banking',
    subtitle: 'All Indian banks supported — direct bank portal login',
    tag: 'Direct Bank'
  },
  {
    id: 'gpay',
    label: 'Google Pay',
    subtitle: 'Pay securely using Google Pay'
  },
  {
    id: 'phonepe',
    label: 'PhonePe',
    subtitle: 'Pay securely using PhonePe'
  },
  {
    id: 'paytm',
    label: 'Paytm',
    subtitle: 'Pay securely using Paytm'
  },
  {
    id: 'upi',
    label: 'UPI Payment',
    subtitle: 'Pay using your UPI ID (BHIM, CRED, Amazon Pay, WhatsApp)'
  }
];

const INDIAN_BANKS: BankConfig[] = [
  {
    id: 'sbi',
    name: 'State Bank of India',
    shortName: 'SBI',
    code: 'SBI',
    accentClass: 'bg-blue-700 text-white',
    portalUrl: 'https://retail.onlinesbi.sbi/retail/login.htm',
    popular: true
  },
  {
    id: 'hdfc',
    name: 'HDFC Bank',
    shortName: 'HDFC',
    code: 'HDFC',
    accentClass: 'bg-indigo-800 text-white',
    portalUrl: 'https://netbanking.hdfcbank.com/netbanking/',
    popular: true
  },
  {
    id: 'icici',
    name: 'ICICI Bank',
    shortName: 'ICICI',
    code: 'ICICI',
    accentClass: 'bg-orange-700 text-white',
    portalUrl: 'https://www.icicibank.com/internet-banking',
    popular: true
  },
  {
    id: 'axis',
    name: 'Axis Bank',
    shortName: 'Axis',
    code: 'AXIS',
    accentClass: 'bg-rose-800 text-white',
    portalUrl: 'https://retail.axisbank.co.in/',
    popular: true
  },
  {
    id: 'kotak',
    name: 'Kotak Mahindra Bank',
    shortName: 'Kotak',
    code: 'KTK',
    accentClass: 'bg-red-700 text-white',
    portalUrl: 'https://netbanking.kotak.com/knb2/',
    popular: true
  },
  {
    id: 'indian',
    name: 'Indian Bank',
    shortName: 'Indian Bank',
    code: 'INDB',
    accentClass: 'bg-sky-800 text-white',
    portalUrl: 'https://www.indianbank.net.in/',
    popular: true
  },
  {
    id: 'canara',
    name: 'Canara Bank',
    shortName: 'Canara',
    code: 'CNR',
    accentClass: 'bg-cyan-700 text-white',
    portalUrl: 'https://online.canarabank.in/',
    popular: false
  },
  {
    id: 'pnb',
    name: 'Punjab National Bank',
    shortName: 'PNB',
    code: 'PNB',
    accentClass: 'bg-amber-700 text-white',
    portalUrl: 'https://netbanking.netpnb.com/',
    popular: false
  },
  {
    id: 'bob',
    name: 'Bank of Baroda',
    shortName: 'BOB',
    code: 'BOB',
    accentClass: 'bg-orange-600 text-white',
    portalUrl: 'https://www.bobibanking.com/',
    popular: false
  },
  {
    id: 'union',
    name: 'Union Bank of India',
    shortName: 'Union Bank',
    code: 'UBI',
    accentClass: 'bg-blue-800 text-white',
    portalUrl: 'https://www.unionbankonline.co.in/',
    popular: false
  }
];

async function copyTextSafely(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for restricted iframe contexts
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const CheckoutModal: React.FC = () => {
  const {
    cart,
    orders,
    activeModal,
    setActiveModal,
    cartSubtotal,
    cartDiscount,
    cartShipping,
    cartTotal,
    placeOrder,
    openOrderTracking,
    getEffectivePrice,
    showToast
  } = useShop();

  // Flipkart / Amazon Checkout Flow:
  // 1. 'details' -> Delivery Address & Item Summary
  // 2. 'payment' -> Flipkart / Amazon Payment Selection (NO QR code, direct "Pay ₹Amount")
  // 3. 'gateway' -> Dedicated Internet Banking / UPI Gateway screen (only returns to store after completing payment)
  // 4. 'pending' -> Returned to Store: Real-Time Payment Verification Pending screen
  const [step, setStep] = useState<'details' | 'payment' | 'gateway' | 'pending'>('details');
  const [gatewayPhase, setGatewayPhase] = useState<'connecting' | 'portal'>('connecting');
  const [gatewaySessionId, setGatewaySessionId] = useState<string>('');
  const [gatewaySecondsLeft, setGatewaySecondsLeft] = useState<number>(600);

  const [selectedPayment, setSelectedPayment] = useState<PaymentOptionId>('netbanking');
  const [selectedBankId, setSelectedBankId] = useState<string>('sbi');
  const [customerUpiId, setCustomerUpiId] = useState<string>('');

  const [transactionIdInput, setTransactionIdInput] = useState('');
  const [paymentConfirmedCheck, setPaymentConfirmedCheck] = useState(false);

  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [liveStatus, setLiveStatus] = useState<Order['status']>('Processing');
  const [liveVerified, setLiveVerified] = useState<boolean>(false);
  const [liveTrackingNumber, setLiveTrackingNumber] = useState<string>('');

  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(false);
  const [copiedTxn, setCopiedTxn] = useState(false);

  // Delivery address fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Tamil Nadu');
  const [pin, setPin] = useState('');

  // Gateway connection animation & session countdown
  useEffect(() => {
    if (step !== 'gateway') return;
    setGatewayPhase('connecting');
    setGatewaySecondsLeft(600);

    const connectTimer = window.setTimeout(() => {
      setGatewayPhase('portal');
    }, 950);

    const countdownInterval = window.setInterval(() => {
      setGatewaySecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      window.clearTimeout(connectTimer);
      window.clearInterval(countdownInterval);
    };
  }, [step]);

  // Subscribe live to Firestore /orderStatus/{orderId} once order is submitted
  useEffect(() => {
    if (!createdOrder?.id) return;

    setLiveStatus(createdOrder.status);
    setLiveVerified(createdOrder.status !== 'Processing');
    setLiveTrackingNumber(createdOrder.trackingNumber || '');

    const unsub = onSnapshot(
      doc(db, 'orderStatus', createdOrder.id),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as {
            status?: Order['status'];
            paymentVerified?: boolean;
            trackingNumber?: string;
          };
          if (data.status) setLiveStatus(data.status);
          if (typeof data.paymentVerified === 'boolean') {
            setLiveVerified(data.paymentVerified);
          }
          if (data.trackingNumber) {
            setLiveTrackingNumber(data.trackingNumber);
          }
        }
      },
      () => {
        // Fallback smoothly to context state
      }
    );

    return () => unsub();
  }, [createdOrder?.id, createdOrder?.status, createdOrder?.trackingNumber]);

  // Sync live with ShopContext orders array
  useEffect(() => {
    if (!createdOrder?.id) return;
    const matched = orders.find((o) => o.id === createdOrder.id);
    if (matched) {
      setLiveStatus(matched.status);
      setLiveVerified(matched.status !== 'Processing');
      if (matched.trackingNumber) {
        setLiveTrackingNumber(matched.trackingNumber);
      }
    }
  }, [orders, createdOrder?.id]);

  if (activeModal !== 'checkout') return null;

  const selectedBank = INDIAN_BANKS.find((b) => b.id === selectedBankId) || INDIAN_BANKS[0];
  const selectedOption = PAYMENT_OPTIONS.find((o) => o.id === selectedPayment) || PAYMENT_OPTIONS[0];
  const itemCount = cart.reduce((sum, it) => sum + it.quantity, 0);

  const encodedPayNote = encodeURIComponent('Banaya Enterprise Order Payment');
  const baseUpiParams = `pa=${BANAYA_UPI_ID}&pn=Banaya%20Enterprise&am=${cartTotal}&cu=INR&tn=${encodedPayNote}`;
  const upiIntentMap: Record<Exclude<PaymentOptionId, 'netbanking'>, string> = {
    gpay: `gpay://upi/pay?${baseUpiParams}`,
    phonepe: `phonepe://upi/pay?${baseUpiParams}`,
    paytm: `paytmmp://pay?${baseUpiParams}`,
    upi: `upi://pay?${baseUpiParams}`
  };

  const activeOrderDisplay: Order | null = createdOrder
    ? {
        ...createdOrder,
        status: liveStatus,
        trackingNumber: liveTrackingNumber || createdOrder.trackingNumber
      }
    : null;

  const resetCheckoutState = () => {
    setStep('details');
    setGatewayPhase('connecting');
    setGatewaySessionId('');
    setSelectedPayment('netbanking');
    setSelectedBankId('sbi');
    setCustomerUpiId('');
    setTransactionIdInput('');
    setPaymentConfirmedCheck(false);
    setCreatedOrder(null);
    setLiveStatus('Processing');
    setLiveVerified(false);
    setLiveTrackingNumber('');
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    resetCheckoutState();
  };

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      showToast('Empty Bag', 'Your shopping bag is empty. Add items before checking out.', 'warning');
      return;
    }

    const cleanPhoneDigits = phone.replace(/[^\d]/g, '');
    const cleanPinDigits = pin.replace(/[^\d]/g, '');
    if (
      !name.trim() ||
      cleanPhoneDigits.length < 10 ||
      !address.trim() ||
      !city.trim() ||
      cleanPinDigits.length < 6
    ) {
      showToast(
        'Check Delivery Details',
        'Please enter full name, 10-digit mobile number, street address, city, and 6-digit PIN code.',
        'warning'
      );
      return;
    }

    setStep('payment');
  };

  // Direct Pay ₹{cartTotal} trigger (Flipkart / Amazon style — zero QR code)
  const handleInitiateDirectPay = () => {
    if (cart.length === 0) {
      showToast('Empty Bag', 'Your shopping bag is empty.', 'warning');
      return;
    }

    if (selectedPayment === 'upi') {
      const cleanUpi = customerUpiId.trim();
      if (!cleanUpi || !/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,}$/.test(cleanUpi)) {
        showToast(
          'Enter Valid UPI ID',
          'Please enter a valid UPI ID (for example: yourname@oksbi or yourname@ybl).',
          'warning'
        );
        return;
      }
    }

    // Trigger UPI app deep-link directly on mobile devices
    if (selectedPayment !== 'netbanking') {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        try {
          const anchor = document.createElement('a');
          anchor.href = upiIntentMap[selectedPayment];
          anchor.style.display = 'none';
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
        } catch {
          // Gateway screen below handles deep-link fallback
        }
      }
    }

    setGatewaySessionId(`GW-${Date.now().toString().slice(-8)}`);
    setTransactionIdInput('');
    setPaymentConfirmedCheck(false);
    setStep('gateway');
  };

  // Complete Payment inside the Net Banking / UPI Gateway & Return to Store Page
  const handleCompleteGatewayAndReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      showToast('Empty Bag', 'Your shopping bag is empty.', 'warning');
      return;
    }

    const cleanedTxn = transactionIdInput.trim().replace(/\s+/g, '');
    if (cleanedTxn.length < 6 || !/^[a-zA-Z0-9_-]+$/.test(cleanedTxn)) {
      showToast(
        'Transaction Reference Required',
        selectedPayment === 'netbanking'
          ? `Please enter the ${selectedBank.shortName} Bank Reference / UTR Number (minimum 6 characters).`
          : 'Please enter the UPI Transaction ID / UTR Number (minimum 6 characters) after completing payment.',
        'warning'
      );
      return;
    }

    if (!paymentConfirmedCheck) {
      showToast(
        'Confirm Completed Payment',
        'Please tick the checkbox confirming your payment was completed before returning to Banaya Enterprise.',
        'warning'
      );
      return;
    }

    const paymentMethodLabel =
      selectedPayment === 'netbanking'
        ? `Net Banking (${selectedBank.name})`
        : selectedPayment === 'upi'
          ? `UPI (${customerUpiId.trim()})`
          : `${selectedOption.label} (${BANAYA_UPI_ID})`;

    const order = placeOrder({
      customerName: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      shippingAddress: `${address.trim()}, ${stateName.trim() || 'India'}`,
      city: city.trim(),
      postalCode: pin.trim(),
      paymentMethod: paymentMethodLabel,
      transactionId: cleanedTxn,
      bankRef: cleanedTxn
    });

    setCreatedOrder(order);
    setLiveStatus('Processing');
    setLiveVerified(false);
    setLiveTrackingNumber(order.trackingNumber);
    setStep('pending');

    showToast(
      'Returned to Banaya Enterprise',
      `Order ${order.id} submitted with reference ${cleanedTxn}. Payment verification is in progress.`,
      'info'
    );
  };

  const handleCopyValue = async (
    value: string,
    setter: React.Dispatch<React.SetStateAction<boolean>>,
    label: string
  ) => {
    const ok = await copyTextSafely(value);
    if (ok) {
      setter(true);
      showToast(`${label} Copied`, `${value} copied to clipboard.`, 'info');
      window.setTimeout(() => setter(false), 2500);
    } else {
      showToast(label, value, 'info');
    }
  };

  const popularBanks = INDIAN_BANKS.filter((b) => b.popular);
  const otherBanks = INDIAN_BANKS.filter((b) => !b.popular);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-start sm:items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      <div
        id="checkout-modal-container"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#F1F3F6] rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto border border-slate-200 shadow-2xl relative my-auto"
      >
        {/* Top Checkout Header Bar */}
        <div
          className={`px-4 sm:px-6 py-3.5 sticky top-0 z-30 flex items-center justify-between gap-3 border-b ${
            step === 'gateway'
              ? 'bg-slate-900 text-white border-slate-800'
              : 'bg-[#064E3B] text-white border-emerald-900/40'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white p-1 shrink-0 flex items-center justify-center">
              {step === 'gateway' && selectedPayment === 'netbanking' ? (
                <Landmark className="w-5 h-5 text-slate-900" />
              ) : (
                <img
                  src="/images/banaya_logo.png"
                  alt="Banaya Enterprises"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-base sm:text-lg font-bold leading-tight truncate">
                {step === 'details' && 'Secure Checkout — Delivery Address'}
                {step === 'payment' && 'Payments — Banaya Enterprise'}
                {step === 'gateway' &&
                  (selectedPayment === 'netbanking'
                    ? `${selectedBank.name} — Internet Banking Gateway`
                    : `${selectedOption.label} — Secure Payment Gateway`)}
                {step === 'pending' &&
                  (liveVerified ? 'Payment Verified & Order Confirmed' : 'Payment Verification Pending')}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-200/90 truncate">
                {step === 'details' && 'Step 1 · Enter delivery address'}
                {step === 'payment' && `Step 2 · Choose Net Banking or UPI · Total ₹${cartTotal.toLocaleString('en-IN')}`}
                {step === 'gateway' &&
                  `Merchant: Banaya Enterprise · Amount: ₹${cartTotal.toLocaleString('en-IN')} · Complete payment to return`}
                {step === 'pending' &&
                  (liveVerified
                    ? `Order ${activeOrderDisplay?.id} confirmed for dispatch`
                    : `Order ${activeOrderDisplay?.id} · Awaiting merchant verification`)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-100 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-300" /> 100% Secure
            </span>
            <button
              id="close-checkout-btn"
              type="button"
              onClick={handleCloseModal}
              aria-label="Close checkout"
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Clean Progress Strip (Hidden during full-focus Bank Gateway redirect screen) */}
        {step !== 'gateway' && (
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5">
            <div className="flex items-center justify-between max-w-2xl mx-auto text-xs font-medium">
              <div
                className={`flex items-center gap-2 ${
                  step === 'details' ? 'text-[#064E3B] font-semibold' : 'text-emerald-700'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    step === 'details' ? 'bg-[#064E3B] text-white' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {step !== 'details' ? <Check className="w-3 h-3" /> : '1'}
                </span>
                <span>Delivery Address</span>
              </div>

              <div className="flex-1 h-px bg-slate-200 mx-2 sm:mx-4" />

              <div
                className={`flex items-center gap-2 ${
                  step === 'payment'
                    ? 'text-[#064E3B] font-semibold'
                    : step === 'pending'
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    step === 'payment'
                      ? 'bg-[#064E3B] text-white'
                      : step === 'pending'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {step === 'pending' ? <Check className="w-3 h-3" /> : '2'}
                </span>
                <span>Payment Options</span>
              </div>

              <div className="flex-1 h-px bg-slate-200 mx-2 sm:mx-4" />

              <div
                className={`flex items-center gap-2 ${
                  step === 'pending'
                    ? liveVerified
                      ? 'text-emerald-700 font-semibold'
                      : 'text-amber-700 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    step === 'pending'
                      ? liveVerified
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {step === 'pending' && liveVerified ? <Check className="w-3 h-3" /> : '3'}
                </span>
                <span>{liveVerified ? 'Confirmed' : 'Verification'}</span>
              </div>
            </div>
          </div>
        )}

        {/* ==================== STEP 1: DELIVERY ADDRESS & SUMMARY ==================== */}
        {step === 'details' && (
          <form onSubmit={handleProceedToPayment} className="p-3 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
              {/* Left Column: Address Form + Order Items */}
              <div className="lg:col-span-8 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="bg-[#064E3B] text-white px-4 py-3 flex items-center gap-2.5 text-sm font-semibold">
                    <span className="w-5 h-5 rounded bg-white text-[#064E3B] text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <span>DELIVERY ADDRESS</span>
                  </div>

                  <div className="p-4 sm:p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label htmlFor="checkout-name" className="block text-xs font-medium text-slate-700 mb-1">
                          Full Name *
                        </label>
                        <input
                          id="checkout-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Enter recipient full name"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div>
                        <label htmlFor="checkout-phone" className="block text-xs font-medium text-slate-700 mb-1">
                          10-Digit Mobile / WhatsApp Number *
                        </label>
                        <input
                          id="checkout-phone"
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="checkout-email" className="block text-xs font-medium text-slate-700 mb-1">
                          Email Address <span className="text-slate-400 font-normal">(for order updates)</span>
                        </label>
                        <input
                          id="checkout-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="checkout-address" className="block text-xs font-medium text-slate-700 mb-1">
                          Address (House No., Building, Street, Area) *
                        </label>
                        <input
                          id="checkout-address"
                          type="text"
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Door / Flat No., Street Name, Landmark"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div>
                        <label htmlFor="checkout-city" className="block text-xs font-medium text-slate-700 mb-1">
                          City / District *
                        </label>
                        <input
                          id="checkout-city"
                          type="text"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="City"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="checkout-state" className="block text-xs font-medium text-slate-700 mb-1">
                            State *
                          </label>
                          <input
                            id="checkout-state"
                            type="text"
                            required
                            value={stateName}
                            onChange={(e) => setStateName(e.target.value)}
                            placeholder="State"
                            className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                          />
                        </div>
                        <div>
                          <label htmlFor="checkout-pin" className="block text-xs font-medium text-slate-700 mb-1">
                            PIN Code *
                          </label>
                          <input
                            id="checkout-pin"
                            type="text"
                            required
                            maxLength={6}
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="600001"
                            className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Preview Box */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between text-sm font-semibold text-slate-800">
                    <span>ORDER SUMMARY ({itemCount} {itemCount === 1 ? 'ITEM' : 'ITEMS'})</span>
                    <span className="text-xs font-normal text-slate-500">Fresh batch dispatch</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {cart.map((item, idx) => {
                      const unitPrice = getEffectivePrice(item);
                      return (
                        <div
                          key={`${item.product.id}-${item.selectedWeight}-${idx}`}
                          className="p-3.5 flex items-center gap-3"
                        >
                          <img
                            src={item.product.image}
                            alt={item.product.name}
                            onLoad={handleProductImageLoad}
                            onError={(e) => handleProductImageError(e, item.product)}
                            className="w-14 h-14 rounded-lg border border-slate-200 bg-slate-50 object-contain p-1 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-slate-900 truncate">{item.product.name}</h4>
                            <p className="text-xs text-slate-500">
                              Pack: {item.selectedWeight} &middot; Qty: {item.quantity}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">
                              ₹{(unitPrice * item.quantity).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Sticky Price Details Sidebar */}
              <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-20">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Price Details
                  </div>

                  <div className="p-4 space-y-3 text-sm">
                    <div className="flex justify-between text-slate-700">
                      <span>Price ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
                      <span className="font-medium tabular-nums">₹{cartSubtotal.toLocaleString('en-IN')}</span>
                    </div>

                    {cartDiscount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Coupon Discount</span>
                        <span className="font-medium tabular-nums">−₹{cartDiscount.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-700">
                      <span>Delivery Charges</span>
                      {cartShipping === 0 ? (
                        <span className="text-emerald-700 font-semibold">FREE</span>
                      ) : (
                        <span className="font-medium tabular-nums">₹{cartShipping}</span>
                      )}
                    </div>

                    <div className="pt-3 border-t border-dashed border-slate-200 flex justify-between items-baseline">
                      <span className="font-semibold text-slate-900">Total Payable</span>
                      <span className="text-xl font-bold text-slate-950 tabular-nums">
                        ₹{cartTotal.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <button
                      id="checkout-continue-payment-btn"
                      type="submit"
                      className="w-full mt-2 h-11 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                    >
                      <span>Continue to Payment</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <p className="text-[11px] text-slate-500 text-center pt-1">
                      Online Payment Only · Cash on Delivery not available
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* ==================== STEP 2: FLIPKART / AMAZON STYLE PAYMENT METHODS (NO QR CODE) ==================== */}
        {step === 'payment' && (
          <div className="p-3 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
              {/* Left Column: Address Recap Strip + 5 Payment Options */}
              <div className="lg:col-span-8 space-y-4">
                {/* Compact Delivery Summary Bar */}
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="text-xs min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        Deliver to: {name} &middot; {pin}
                      </div>
                      <p className="text-slate-500 truncate">
                        {address}, {city}, {stateName} &middot; {phone}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('details')}
                    className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#064E3B] shrink-0 cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                {/* Payment Options Accordion (Exact 5 Allowed Methods — Zero QR Code) */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="bg-[#064E3B] text-white px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-sm font-semibold">
                      <span className="w-5 h-5 rounded bg-white text-[#064E3B] text-xs font-bold flex items-center justify-center">
                        2
                      </span>
                      <span>PAYMENT OPTIONS</span>
                    </div>
                    <span className="text-xs text-emerald-100 font-medium tabular-nums">
                      Payable: ₹{cartTotal.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-200">
                    {PAYMENT_OPTIONS.map((option) => {
                      const isSelected = selectedPayment === option.id;
                      return (
                        <div
                          key={option.id}
                          className={isSelected ? 'bg-[#F5FAFF]/70' : 'bg-white'}
                        >
                          {/* Radio Option Row */}
                          <button
                            type="button"
                            onClick={() => setSelectedPayment(option.id)}
                            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                  isSelected ? 'border-[#064E3B]' : 'border-slate-300'
                                }`}
                              >
                                {isSelected && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-[#064E3B]" />
                                )}
                              </span>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">
                                    {option.label}
                                  </span>
                                  {option.tag && (
                                    <span className="text-[11px] font-semibold text-emerald-700">
                                      &middot; {option.tag}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {option.subtitle}
                                </div>
                              </div>
                            </div>

                            <span className="shrink-0">
                              {option.id === 'netbanking' ? (
                                <Building2 className="w-4 h-4 text-[#064E3B]" />
                              ) : (
                                <Smartphone className="w-4 h-4 text-[#064E3B]" />
                              )}
                            </span>
                          </button>

                          {/* Expanded Payment Action Panel */}
                          {isSelected && (
                            <div className="px-4 pb-5 pt-2 sm:pl-11 border-t border-slate-100 space-y-4">
                              {option.id === 'netbanking' ? (
                                /* AMAZON / FLIPKART STYLE NET BANKING */
                                <div className="space-y-4">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 mb-2">
                                      Popular Banks
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                      {popularBanks.map((bank) => {
                                        const activeBank = selectedBankId === bank.id;
                                        return (
                                          <button
                                            key={bank.id}
                                            type="button"
                                            onClick={() => setSelectedBankId(bank.id)}
                                            className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                                              activeBank
                                                ? 'border-[#064E3B] bg-white ring-1 ring-[#064E3B]'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                            }`}
                                          >
                                            <span
                                              className={`w-7 h-7 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0 ${bank.accentClass}`}
                                            >
                                              {bank.code}
                                            </span>
                                            <span className="text-xs font-medium text-slate-900 truncate">
                                              {bank.shortName}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div>
                                    <label
                                      htmlFor="checkout-other-banks"
                                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                                    >
                                      Or Select Bank from List
                                    </label>
                                    <select
                                      id="checkout-other-banks"
                                      value={selectedBankId}
                                      onChange={(e) => setSelectedBankId(e.target.value)}
                                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:border-[#064E3B]"
                                    >
                                      <optgroup label="Popular Banks">
                                        {popularBanks.map((b) => (
                                          <option key={b.id} value={b.id}>
                                            {b.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                      <optgroup label="Other Indian Banks">
                                        {otherBanks.map((b) => (
                                          <option key={b.id} value={b.id}>
                                            {b.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    </select>
                                  </div>

                                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                                    <button
                                      id="pay-netbanking-btn"
                                      type="button"
                                      onClick={handleInitiateDirectPay}
                                      className="w-full sm:w-auto min-w-[230px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                    >
                                      <span>Pay ₹{cartTotal.toLocaleString('en-IN')}</span>
                                      <ArrowRight className="w-4 h-4" />
                                    </button>
                                    <span className="text-[11px] text-slate-500">
                                      Redirects to <strong>{selectedBank.shortName}</strong> Internet Banking to complete payment.
                                    </span>
                                  </div>
                                </div>
                              ) : option.id === 'upi' ? (
                                /* AMAZON / FLIPKART STYLE UPI ID ENTRY (NO QR CODE) */
                                <div className="space-y-3 max-w-md">
                                  <div>
                                    <label
                                      htmlFor="checkout-upi-id"
                                      className="block text-xs font-semibold text-slate-700 mb-1"
                                    >
                                      Enter your UPI ID
                                    </label>
                                    <input
                                      id="checkout-upi-id"
                                      type="text"
                                      value={customerUpiId}
                                      onChange={(e) => setCustomerUpiId(e.target.value)}
                                      placeholder="yourname@oksbi or yourname@ybl"
                                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                                    />
                                    <p className="text-[11px] text-slate-500 mt-1">
                                      The payment request will open securely in your UPI app.
                                    </p>
                                  </div>

                                  <button
                                    id="pay-upi-btn"
                                    type="button"
                                    onClick={handleInitiateDirectPay}
                                    className="w-full sm:w-auto min-w-[230px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                  >
                                    <span>Verify &amp; Pay ₹{cartTotal.toLocaleString('en-IN')}</span>
                                    <ArrowRight className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                /* GOOGLE PAY / PHONEPE / PAYTM DIRECT PAY BUTTON (NO QR CODE) */
                                <div className="space-y-3">
                                  <p className="text-xs text-slate-600">
                                    Clicking Pay will open <strong>{option.label}</strong> payment authorization for{' '}
                                    <strong className="text-slate-900 tabular-nums">
                                      ₹{cartTotal.toLocaleString('en-IN')}
                                    </strong>
                                    . You will return automatically to Banaya Enterprise after completing payment.
                                  </p>
                                  <button
                                    id={`pay-${option.id}-btn`}
                                    type="button"
                                    onClick={handleInitiateDirectPay}
                                    className="w-full sm:w-auto min-w-[230px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                  >
                                    <span>Pay ₹{cartTotal.toLocaleString('en-IN')} with {option.label}</span>
                                    <ArrowRight className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Sticky Price Details Sidebar */}
              <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-20">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Price Details
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    <div className="flex justify-between text-slate-700">
                      <span>Price ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
                      <span className="font-medium tabular-nums">₹{cartSubtotal.toLocaleString('en-IN')}</span>
                    </div>

                    {cartDiscount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Discount</span>
                        <span className="font-medium tabular-nums">−₹{cartDiscount.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-700">
                      <span>Delivery Charges</span>
                      {cartShipping === 0 ? (
                        <span className="text-emerald-700 font-semibold">FREE</span>
                      ) : (
                        <span className="font-medium tabular-nums">₹{cartShipping}</span>
                      )}
                    </div>

                    <div className="pt-3 border-t border-dashed border-slate-200 flex justify-between items-baseline">
                      <span className="font-semibold text-slate-900">Amount Payable</span>
                      <span className="text-xl font-bold text-slate-950 tabular-nums">
                        ₹{cartTotal.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Selected Method</span>
                        <span className="font-medium text-slate-800">
                          {selectedPayment === 'netbanking'
                            ? `${selectedBank.shortName} NetBanking`
                            : selectedOption.label}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Merchant</span>
                        <span className="font-medium text-slate-800">Banaya Enterprise</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-3.5 text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Prepaid Checkout Policy</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Cash on Delivery is not available. Complete payment via Net Banking or UPI to return and confirm your order.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== STEP 3: DEDICATED INTERNET BANKING / UPI GATEWAY SCREEN ==================== */}
        {step === 'gateway' && (
          <div className="p-4 sm:p-8">
            {gatewayPhase === 'connecting' ? (
              /* Smooth Gateway Handoff Interstitial */
              <div className="max-w-lg mx-auto bg-white rounded-xl border border-slate-200 p-8 sm:p-10 text-center space-y-5 shadow-sm">
                <div className="w-14 h-14 rounded-full bg-slate-100 text-[#064E3B] flex items-center justify-center mx-auto">
                  <Loader2 className="w-7 h-7 animate-spin" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-heading text-xl font-bold text-slate-900">
                    {selectedPayment === 'netbanking'
                      ? `Redirecting to ${selectedBank.name}...`
                      : `Connecting to ${selectedOption.label}...`}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Preparing secure payment gateway session for{' '}
                    <strong className="text-slate-900 tabular-nums">
                      ₹{cartTotal.toLocaleString('en-IN')}
                    </strong>{' '}
                    to Banaya Enterprise.
                  </p>
                </div>
                <div className="text-[11px] text-slate-400">
                  Do not refresh or close this window...
                </div>
              </div>
            ) : (
              /* Dedicated Full Gateway Screen — Only returns to store after completing payment */
              <form onSubmit={handleCompleteGatewayAndReturn} className="max-w-2xl mx-auto space-y-4">
                {/* Bank / Gateway Top Summary Strip */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-slate-900 text-white px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {selectedPayment === 'netbanking' ? (
                        <span
                          className={`px-2.5 py-1 rounded text-xs font-bold ${selectedBank.accentClass}`}
                        >
                          {selectedBank.code}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-bold">
                          UPI
                        </span>
                      )}
                      <div>
                        <div className="text-sm font-semibold">
                          {selectedPayment === 'netbanking'
                            ? `${selectedBank.name} NetBanking`
                            : `${selectedOption.label} Gateway`}
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono">
                          Session: {gatewaySessionId}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] text-slate-300">Session expires in</div>
                      <div className="text-sm font-mono font-bold text-amber-300 tabular-nums">
                        {formatTimer(gatewaySecondsLeft)}
                      </div>
                    </div>
                  </div>

                  {/* Merchant & Payable Amount Box */}
                  <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Merchant Name</span>
                      <strong className="text-sm text-slate-900">Banaya Enterprise</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Payable Amount</span>
                      <strong className="text-lg font-bold text-[#064E3B] tabular-nums">
                        ₹{cartTotal.toLocaleString('en-IN')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Merchant Payment ID</span>
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono font-semibold text-slate-900 truncate">
                          {BANAYA_UPI_ID}
                        </code>
                        <button
                          type="button"
                          onClick={() => void handleCopyValue(BANAYA_UPI_ID, setCopiedVpa, 'UPI ID')}
                          className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer shrink-0"
                          title="Copy Merchant ID"
                        >
                          {copiedVpa ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action Body */}
                  <div className="p-4 sm:p-6 space-y-5 bg-white">
                    {selectedPayment === 'netbanking' ? (
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-slate-900">
                              Step 1: Open {selectedBank.name} Internet Banking
                            </h4>
                            <p className="text-xs text-slate-600">
                              Sign in to your {selectedBank.shortName} NetBanking portal and complete the{' '}
                              <strong className="text-slate-900 tabular-nums">
                                ₹{cartTotal.toLocaleString('en-IN')}
                              </strong>{' '}
                              transfer to <strong>Banaya Enterprise</strong> ({BANAYA_UPI_ID}).
                            </p>
                          </div>

                          <a
                            href={selectedBank.portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-10 px-4 rounded-lg bg-[#064E3B] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
                          >
                            <span>Open {selectedBank.shortName} NetBanking</span>
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-slate-900">
                              Step 1: Approve ₹{cartTotal.toLocaleString('en-IN')} in {selectedOption.label}
                            </h4>
                            <p className="text-xs text-slate-600">
                              {selectedPayment === 'upi' && customerUpiId
                                ? `Open your UPI app linked to ${customerUpiId} and authorize ₹${cartTotal.toLocaleString('en-IN')} to Banaya Enterprise.`
                                : `Open ${selectedOption.label} on your phone and complete the ₹${cartTotal.toLocaleString('en-IN')} transfer to Banaya Enterprise (${BANAYA_UPI_ID}).`}
                            </p>
                          </div>

                          <a
                            href={upiIntentMap[selectedPayment]}
                            className="h-10 px-4 rounded-lg bg-[#064E3B] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
                          >
                            <Smartphone className="w-4 h-4" />
                            <span>Open {selectedOption.label} App</span>
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Step 2 inside Gateway: Enter Bank / UPI Reference to Complete Payment & Return to Store */}
                    <div className="space-y-3 pt-1">
                      <div>
                        <label
                          htmlFor="gateway-txn-id"
                          className="block text-xs font-semibold text-slate-800 mb-1"
                        >
                          {selectedPayment === 'netbanking'
                            ? `Step 2: Enter ${selectedBank.shortName} Bank Reference / UTR Number *`
                            : `Step 2: Enter ${selectedOption.label} Transaction ID / UTR *`}
                        </label>
                        <input
                          id="gateway-txn-id"
                          type="text"
                          required
                          value={transactionIdInput}
                          onChange={(e) => setTransactionIdInput(e.target.value)}
                          placeholder={
                            selectedPayment === 'netbanking'
                              ? 'e.g. SBI241116009812 or IMPS UTR'
                              : 'e.g. 432198765432 (12-digit UPI Ref ID)'
                          }
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Enter the reference shown on your bank or UPI receipt after payment succeeds.
                        </p>
                      </div>

                      <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer text-xs text-slate-800">
                        <input
                          type="checkbox"
                          checked={paymentConfirmedCheck}
                          onChange={(e) => setPaymentConfirmedCheck(e.target.checked)}
                          className="mt-0.5 w-4 h-4 accent-[#064E3B] cursor-pointer shrink-0"
                        />
                        <span>
                          I have completed the{' '}
                          <strong>₹{cartTotal.toLocaleString('en-IN')}</strong> payment{' '}
                          {selectedPayment === 'netbanking'
                            ? `via ${selectedBank.name}`
                            : `via ${selectedOption.label}`}{' '}
                          and want to return to Banaya Enterprise.
                        </span>
                      </label>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                        <button
                          id="complete-payment-return-btn"
                          type="submit"
                          className="flex-1 h-11 px-5 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                        >
                          <span>Complete Payment &amp; Return to Banaya</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setStep('payment')}
                          className="h-11 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Cancel &amp; Go Back</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ==================== STEP 4: RETURNED TO PAGE — PAYMENT VERIFICATION PENDING ==================== */}
        {step === 'pending' && activeOrderDisplay && (
          <div className="p-4 sm:p-8">
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Status Card Header */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-7 text-center space-y-3 shadow-2xs">
                <div
                  className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center ${
                    liveVerified
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}
                >
                  {liveVerified ? <BadgeCheck className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
                </div>

                <div className="space-y-1">
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      liveVerified ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {liveVerified ? 'Verified by Merchant' : 'Awaiting Merchant Verification'}
                  </p>
                  <h3 className="font-heading text-2xl sm:text-3xl font-bold text-slate-950">
                    {liveVerified ? 'Payment Verified & Order Confirmed' : 'Payment Verification Pending'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                    {liveVerified
                      ? `Your payment of ₹${activeOrderDisplay.totalAmount.toLocaleString('en-IN')} has been verified. Your order is now ${liveStatus}.`
                      : `Thank you, ${activeOrderDisplay.customerName}. We recorded your order and reference for ₹${activeOrderDisplay.totalAmount.toLocaleString('en-IN')}. Our team is verifying the credit in our Banaya Enterprise account before confirming dispatch.`}
                  </p>
                </div>
              </div>

              {/* Submitted Transaction & Order Summary */}
              <div
                id="payment-verification-summary"
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
              >
                <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700 bg-slate-50/70">
                  <span>PAYMENT &amp; ORDER REFERENCE</span>
                  <span
                    className={
                      liveVerified ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'
                    }
                  >
                    {liveVerified ? `Status: ${liveStatus}` : 'Status: Verification Pending'}
                  </span>
                </div>

                <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-0.5">Order ID &amp; Receipt No.</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="font-mono text-sm text-slate-950">
                        {activeOrderDisplay.id}
                      </strong>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                        {activeOrderDisplay.receiptNumber || formatReceiptNumber(activeOrderDisplay.id)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopyValue(activeOrderDisplay.id, setCopiedOrderId, 'Order ID')
                        }
                        className="p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                        title="Copy Order ID"
                      >
                        {copiedOrderId ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Submitted Transaction / UTR ID</span>
                    <div className="flex items-center gap-2">
                      <strong className="font-mono text-sm text-slate-950">
                        {activeOrderDisplay.transactionId || activeOrderDisplay.bankRef || 'Submitted'}
                      </strong>
                      {(activeOrderDisplay.transactionId || activeOrderDisplay.bankRef) && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyValue(
                              activeOrderDisplay.transactionId || activeOrderDisplay.bankRef || '',
                              setCopiedTxn,
                              'Transaction ID'
                            )
                          }
                          className="p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                          title="Copy Transaction ID"
                        >
                          {copiedTxn ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Order Amount</span>
                    <strong className="text-sm text-slate-950 tabular-nums">
                      ₹{activeOrderDisplay.totalAmount.toLocaleString('en-IN')}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Payment Method</span>
                    <strong className="text-slate-900">{activeOrderDisplay.paymentMethod}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Merchant</span>
                    <span className="text-slate-800 font-medium">Banaya Enterprise ({BANAYA_CONTACT_EMAIL})</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Delivery Address</span>
                    <span className="text-slate-800">
                      {activeOrderDisplay.shippingAddress}, {activeOrderDisplay.city} -{' '}
                      {activeOrderDisplay.postalCode}
                    </span>
                  </div>
                </div>

                {/* Automatic Admin Alert & Customer Receipt Status */}
                <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-emerald-50/50 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <BellRing className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        Admin Receipt &amp; Alert Dispatched
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Receipt <span className="font-mono">{activeOrderDisplay.receiptNumber || formatReceiptNumber(activeOrderDisplay.id)}</span> &amp; UTR alerted immediately to Banaya Admin Desk ({BANAYA_CONTACT_EMAIL}).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <FileText className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        {liveVerified ? 'Confirmed Order Sent to Customer' : 'Customer Receipt & Live Sync Ready'}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {liveVerified
                          ? `Verified confirmation & tracking (${activeOrderDisplay.trackingNumber}) delivered for ${activeOrderDisplay.email || activeOrderDisplay.phone}.`
                          : `Receipt recorded${activeOrderDisplay.email ? ` for ${activeOrderDisplay.email}` : ''}. Live order confirmation updates automatically once verified.`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Compact Itemized Receipt Summary */}
                <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-white space-y-2 text-xs">
                  <div className="font-semibold text-slate-800 flex items-center justify-between">
                    <span>Order Receipt Items ({activeOrderDisplay.items.reduce((s, it) => s + it.quantity, 0)})</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {activeOrderDisplay.date}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg px-3">
                    {activeOrderDisplay.items.map((item, idx) => {
                      const unitPrice = getPriceForProductWeight(item.product, item.selectedWeight).price;
                      return (
                        <div key={idx} className="py-2 flex items-center justify-between gap-2">
                          <span className="text-slate-700 truncate">
                            {item.product.name} ({item.selectedWeight}) × {item.quantity}
                          </span>
                          <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                            ₹{(unitPrice * item.quantity).toLocaleString('en-IN')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3-Step Verification Progress */}
                <div className="px-4 sm:px-5 py-4 border-t border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="text-xs font-semibold text-slate-800">Verification Progress</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-white border border-emerald-200 flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-900">1. Receipt &amp; Alert Sent</div>
                        <div className="text-[11px] text-slate-500">Order &amp; UTR alerted to admin</div>
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-lg bg-white border flex items-start gap-2.5 ${
                        liveVerified ? 'border-emerald-200' : 'border-amber-300'
                      }`}
                    >
                      {liveVerified ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-semibold text-slate-900">
                          {liveVerified ? '2. Payment Verified' : '2. Merchant Verification'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {liveVerified ? 'Confirmed by Banaya desk' : 'Pending bank reconciliation'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-lg bg-white border flex items-start gap-2.5 ${
                        liveVerified ? 'border-emerald-200' : 'border-slate-200'
                      }`}
                    >
                      <Truck
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          liveVerified ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <div className="font-semibold text-slate-900">3. Order Confirmation</div>
                        <div className="text-[11px] text-slate-500">
                          {liveVerified
                            ? `Tracking: ${activeOrderDisplay.trackingNumber}`
                            : 'Starts after verification'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => downloadOrderReceipt(activeOrderDisplay, liveVerified)}
                  className="h-11 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Official Receipt</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const url = getOrderWhatsAppUrl(
                      activeOrderDisplay,
                      activeOrderDisplay.transactionId || activeOrderDisplay.bankRef
                    );
                    openWhatsAppUrl(url);
                  }}
                  className="flex-1 h-11 px-4 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <MessageCircle className="w-4 h-4 fill-current" />
                  <span>WhatsApp Receipt ({DISPLAY_PHONE_NUMBER})</span>
                </button>

                <button
                  type="button"
                  onClick={() => openOrderTracking(activeOrderDisplay.id)}
                  className="h-11 px-4 rounded-lg bg-[#064E3B] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Truck className="w-4 h-4" />
                  <span>Track Order Status</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Reference</span>
                  </button>

                  {activeOrderDisplay.email && (
                    <a
                      href={buildCustomerConfirmationMailtoUrl(activeOrderDisplay)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Save Copy via Email</span>
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-medium cursor-pointer"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
