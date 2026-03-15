/* ============================
   BASFAY Catalog Site
   Step-by-step Checkout
   Product page links via slug
   Dead products auto-filtered
   Safer image loading + lighter mobile rendering
   School filter support
   ============================ */

console.log("✅ BASFAY app.js LOADED (STEP CHECKOUT + DIRECT MPESA + SCHOOL FILTER)");

const CONFIG = {
  currency: "KES",
  pickup: "Kangemi",
  businessName: "BASFAY Uniforms",
  turnstileSiteKey: "0x4AAAAAACnvQa10Y55LL_Rg",

  reviewsListEndpoint: "/api/reviews",
  reviewSubmitEndpoint: "/api/reviews/submit",

  deliveryAreas: {
    "Kangemi": 100,
    "Westlands": 150,
    "Waiyaki Way": 100,
    "CBD": 200,
    "Kilimani": 200,
    "Ngong Road": 200,
    "Kasarani": 200,
    "Embakasi": 200
  }
};

const FUTURE_CATEGORIES = [
  "Sweater", "Shirt", "Dress", "Socks", "Marvin", "Tracksuit", "Gameskit", "PE Shirt",
  "Trousers", "School Bag", "Shoes", "Blazer", "Materials", "Cardigan", "Accessory",
];

const INITIAL_VISIBLE_PRODUCTS = 9999;
const LOAD_MORE_PRODUCTS_STEP = 9999;

const els = {
  year: document.getElementById("year"),

  categoryDropdown: document.getElementById("categoryDropdown"),
  colorFilterTop: document.getElementById("colorFilterTop"),
  sortByTop: document.getElementById("sortByTop"),
  resultsCount: document.getElementById("resultsCount"),

  productGrid: document.getElementById("productGrid"),
  emptyState: document.getElementById("emptyState"),

  openCart: document.getElementById("openCart"),
  closeDrawer: document.getElementById("closeDrawer"),
  drawer: document.getElementById("drawer"),
  drawerBackdrop: document.getElementById("drawerBackdrop"),
  cartCount: document.getElementById("cartCount"),
  cartEmpty: document.getElementById("cartEmpty"),
  clearCart: document.getElementById("clearCart"),

  orderItems: document.getElementById("orderItems"),
  orderSubtotal: document.getElementById("orderSubtotal"),
  deliveryFeeDisplay: document.getElementById("deliveryFeeDisplay"),
  orderTotal: document.getElementById("orderTotal"),

  cartPreviewCount: document.getElementById("cartPreviewCount"),
  cartPreviewItems: document.getElementById("cartPreviewItems"),
  cartPreviewSubtotal: document.getElementById("cartPreviewSubtotal"),
  openCartPreview: document.getElementById("openCartPreview"),

  checkoutBtn: document.getElementById("checkoutBtn"),
  checkoutNextBtn: document.getElementById("checkoutNextBtn"),
  checkoutBackBtn: document.getElementById("checkoutBackBtn"),
  checkoutStepTitle: document.getElementById("checkoutStepTitle"),
  checkoutStepMeta: document.getElementById("checkoutStepMeta"),

  checkoutStep1: document.getElementById("checkoutStep1"),
  checkoutStep2: document.getElementById("checkoutStep2"),
  checkoutStep3: document.getElementById("checkoutStep3"),
  checkoutStep4: document.getElementById("checkoutStep4"),

  fulfillmentRadios: document.querySelectorAll('input[name="fulfillmentMethod"]'),
  payRadios: document.querySelectorAll('input[name="payMethod"]'),

  pickupBox: document.getElementById("pickupBox"),
  deliveryBox: document.getElementById("deliveryBox"),
  deliveryArea: document.getElementById("deliveryArea"),
  deliveryAddress: document.getElementById("deliveryAddress"),
  deliveryLandmark: document.getElementById("deliveryLandmark"),

  mpesaBox: document.getElementById("mpesaBox"),
  cashBox: document.getElementById("cashBox"),

  customerPhone: document.getElementById("customerPhone"),
  customerName: document.getElementById("customerName"),
  customerEmail: document.getElementById("customerEmail"),

  phoneStepWrap: document.getElementById("phoneStepWrap"),
  nameStepWrap: document.getElementById("nameStepWrap"),
  emailStepWrap: document.getElementById("emailStepWrap"),

  reviewFulfillment: document.getElementById("reviewFulfillment"),
  reviewPayment: document.getElementById("reviewPayment"),
  reviewPhoneRow: document.getElementById("reviewPhoneRow"),
  reviewPhone: document.getElementById("reviewPhone"),
  reviewAreaRow: document.getElementById("reviewAreaRow"),
  reviewArea: document.getElementById("reviewArea"),
  reviewAddressRow: document.getElementById("reviewAddressRow"),
  reviewAddress: document.getElementById("reviewAddress"),
  reviewLandmarkRow: document.getElementById("reviewLandmarkRow"),
  reviewLandmark: document.getElementById("reviewLandmark"),

  modal: document.getElementById("modal"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  closeModal: document.getElementById("closeModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalPrice: document.getElementById("modalPrice"),
  modalMeta: document.getElementById("modalMeta"),
  modalDesc: document.getElementById("modalDesc"),
  modalMedia: document.getElementById("modalMedia"),
  modalAdd: document.getElementById("modalAdd"),
  modalSizeField: document.getElementById("modalSizeField"),
  modalSize: document.getElementById("modalSize"),
  modalViewDetails: document.getElementById("modalViewDetails"),
};

let PRODUCTS = [];
let state = { color: "", type: "", school: "", sort: "featured" };
let visibleProductCount = INITIAL_VISIBLE_PRODUCTS;
let revealObserver = null;
let checkoutStep = 1;

const CART_KEY = "basfay_cart_v3";
const LAST_ORDER_ID_KEY = "basfay_last_order_id_v3";
const LAST_CUSTOMER_PHONE_KEY = "basfay_last_customer_phone_v3";

const reviewState = {
  currentProductId: "",
  ui: null,
  widgetId: null,
  scriptPromise: null,
  cache: new Map(),
};

/* Helpers */
function safeText(s) { return String(s ?? "").trim(); }
function normalize(s) { return safeText(s).toLowerCase(); }
function money(n) { return `${CONFIG.currency} ${Number(n || 0).toLocaleString("en-KE")}`; }

function formatMoney(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return "";
  return money(Number(amount));
}

function toTypeClass(type) {
  return "type-" + normalize(type).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function cleanPhone(raw) { return safeText(raw).replace(/[^\d+]/g, ""); }

function normalizeKenyanPhone(raw) {
  let phone = cleanPhone(raw);
  if (!phone) return "";

  if (phone.startsWith("+254")) return `254${phone.slice(4)}`;
  if (phone.startsWith("254")) return phone;
  if ((phone.startsWith("07") || phone.startsWith("01")) && phone.length === 10) return `254${phone.slice(1)}`;
  if ((phone.startsWith("7") || phone.startsWith("1")) && phone.length === 9) return `254${phone}`;
  return phone;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function starsForRating(rating) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

function reviewDateText(ts) {
  if (!ts) return "";
  try {
    return new Date(Number(ts) * 1000).toLocaleDateString("en-KE", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "";
  }
}

function getProductsJsonPath() {
  return window.BASFAY_PRODUCTS_JSON || document.body?.dataset?.productsJson || "/products.json";
}

function getProductPageBase() {
  return window.BASFAY_PRODUCT_PAGE_BASE || document.body?.dataset?.productPageBase || "/product.html?slug=";
}

function getProductSlug(product) {
  return safeText(product?.slug) || safeText(product?.id);
}

function getProductUrl(product) {
  const slug = getProductSlug(product);
  return `${getProductPageBase()}${encodeURIComponent(slug)}`;
}

function getSchoolFromUrl() {
  try {
    const url = new URL(window.location.href);
    return safeText(url.searchParams.get("school"));
  } catch {
    return "";
  }
}

function productMatchesSchool(product, selectedSchool) {
  const wanted = normalize(selectedSchool);
  if (!wanted) return true;

  const singleSchool = normalize(product?.school);
  if (singleSchool && singleSchool === wanted) return true;

  const schoolList = Array.isArray(product?.schools)
    ? product.schools.map(normalize).filter(Boolean)
    : [];

  return schoolList.includes(wanted);
}

/* Safe image helpers */
function normalizeImageSourcePath(src) {
  const value = safeText(src);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return value;
  if (value.startsWith("./")) return `/${value.slice(2)}`;
  return `/${value.replace(/^\/+/, "")}`;
}

function applyResponsiveImage(img, src, options = {}) {
  if (!img) return;

  const normalized = normalizeImageSourcePath(src);
  if (!normalized) return;

  img.src = normalized;
  img.alt = safeText(options.alt);
  img.loading = options.eager ? "eager" : "lazy";
  img.fetchPriority = options.eager ? "high" : "low";
  img.decoding = "async";
  img.width = Number(options.width) || 640;
  img.height = Number(options.height) || 640;
}

function renderResponsiveImageInto(container, src, alt, options = {}) {
  if (!container) return;
  container.innerHTML = "";

  const normalized = normalizeImageSourcePath(src);
  if (!normalized) return;

  const img = document.createElement("img");
  applyResponsiveImage(img, normalized, {
    alt,
    eager: Boolean(options.eager),
    width: Number(options.width) || 960,
    height: Number(options.height) || 960
  });

  container.appendChild(img);
}

function getCardImageOptions(index = 0) {
  return {
    eager: index < 1,
    width: 640,
    height: 640
  };
}

function getModalImageOptions() {
  return {
    eager: true,
    width: 960,
    height: 960
  };
}

function getProductBasePrice(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (variants.length) {
    const prices = variants
      .map(v => Number(v.price))
      .filter(v => !Number.isNaN(v));
    if (prices.length) return Math.min(...prices);
  }

  if (product?.basePrice != null && !Number.isNaN(Number(product.basePrice))) {
    return Number(product.basePrice);
  }

  if (product?.price != null && !Number.isNaN(Number(product.price))) {
    return Number(product.price);
  }

  return null;
}

function isLiveProductEntry(product) {
  const hasIdentity = Boolean(safeText(product?.id) && safeText(product?.name));
  const hasPrice = getProductBasePrice(product) != null;
  return hasIdentity && hasPrice;
}

function getProductDisplayPrice(product) {
  const base = getProductBasePrice(product);
  if (base == null) return "Price on request";
  return Array.isArray(product?.variants) && product.variants.length
    ? `From ${formatMoney(base)}`
    : formatMoney(base);
}

function resetVisibleProducts() {
  visibleProductCount = INITIAL_VISIBLE_PRODUCTS;
}

function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    if (state.color && p.color !== state.color) return false;
    if (state.type && normalize(p.type) !== normalize(state.type)) return false;
    if (state.school && !productMatchesSchool(p, state.school)) return false;
    return true;
  });
}

function getVisibleSortedProducts() {
  const filtered = getFilteredProducts();
  const sorted = applySort(filtered);
  const visible = sorted.slice(0, visibleProductCount);
  return { filtered, sorted, visible };
}

function createLoadMoreCard(totalCount, visibleCount) {
  const wrap = document.createElement("div");
  wrap.style.gridColumn = "1 / -1";
  wrap.style.display = "flex";
  wrap.style.justifyContent = "center";
  wrap.style.padding = "8px 0 4px";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn primary";
  btn.textContent = `Load more (${Math.max(totalCount - visibleCount, 0)} more)`;
  btn.addEventListener("click", () => {
    visibleProductCount += LOAD_MORE_PRODUCTS_STEP;
    renderProducts();
  });

  wrap.appendChild(btn);
  return wrap;
}

function initRevealAnimations(scope = document) {
  if (revealObserver) {
    revealObserver.disconnect();
    revealObserver = null;
  }

  const revealEls = scope.querySelectorAll(".reveal:not(.show)");
  if (!revealEls.length) return;

  if (!("IntersectionObserver" in window)) {
    revealEls.forEach(el => el.classList.add("show"));
    return;
  }

  revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("show");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  revealEls.forEach(el => revealObserver.observe(el));
}

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position = "fixed";
  t.style.left = "50%";
  t.style.bottom = "18px";
  t.style.transform = "translateX(-50%)";
  t.style.padding = "10px 12px";
  t.style.borderRadius = "12px";
  t.style.background = "rgba(0,0,0,0.88)";
  t.style.color = "#fff";
  t.style.fontSize = "12px";
  t.style.zIndex = "9999";
  t.style.maxWidth = "90vw";
  t.style.textAlign = "center";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

async function apiGetJson(url) {
  const res = await fetch(url, { credentials: "include" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function apiPostJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload || {})
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function getReviewsUrl(productId) {
  return `${CONFIG.reviewsListEndpoint}?product_id=${encodeURIComponent(productId)}`;
}

async function submitReviewRequest(payload) {
  try {
    return await apiPostJson(CONFIG.reviewSubmitEndpoint, payload);
  } catch (err) {
    if (err?.status === 404) {
      return await apiPostJson(CONFIG.reviewsListEndpoint, {
        product_id: payload.product_id,
        customer_name: payload.customer_name,
        rating: payload.rating,
        review_text: payload.review_text
      });
    }
    throw err;
  }
}

async function announceOrderId(orderId) {
  const id = safeText(orderId);
  if (!id) return;
  localStorage.setItem(LAST_ORDER_ID_KEY, id);

  try {
    await navigator.clipboard.writeText(id);
    toast(`Order ID copied ✅ (${id.slice(0, 8)}...)`);
  } catch {
    toast(`Order ID: ${id}`);
  }
}

/* Cart store */
function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cartCountTotal() {
  return getCart().reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
}

function calcSubtotal() {
  return getCart().reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
}

function getSelectedPayMethod() {
  const checked = [...(els.payRadios || [])].find(r => r.checked);
  return safeText(checked?.value).toLowerCase() || "mpesa";
}

function getSelectedFulfillmentMethod() {
  const checked = [...(els.fulfillmentRadios || [])].find(r => r.checked);
  return safeText(checked?.value).toLowerCase() || "pickup";
}

function getDeliveryFee() {
  const fulfillment = getSelectedFulfillmentMethod();
  if (fulfillment !== "delivery") return 0;

  const area = safeText(els.deliveryArea?.value);
  return Number(CONFIG.deliveryAreas[area] || 0);
}

function calcOrderTotal() {
  return calcSubtotal() + getDeliveryFee();
}

function buildOrderItemsPayload() {
  const cart = getCart();
  return cart.map(item => {
    const p = PRODUCTS.find(x => normalize(x.id) === normalize(item.id));
    return {
      product_id: item.id,
      id: item.id,
      name: p?.name || safeText(item.id),
      color: p?.color || "",
      type: p?.type || "",
      school: p?.school || "",
      schools: Array.isArray(p?.schools) ? p.schools : [],
      size: item.size,
      qty: Number(item.qty) || 1,
      price: Number(item.price) || 0,
      line_total: (Number(item.price) || 0) * (Number(item.qty) || 0)
    };
  });
}

function setCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  refreshAllCartUIs();
}

function addToCart(productId, size, price, qty = 1) {
  const cart = getCart();
  const key = `${productId}__${size}`;
  const found = cart.find(i => i.key === key);
  if (found) found.qty = (Number(found.qty) || 0) + (Number(qty) || 1);
  else cart.push({ key, id: productId, size: String(size), price: Number(price), qty: Number(qty) || 1 });

  setCart(cart);

  const p = PRODUCTS.find(x => normalize(x.id) === normalize(productId));
  toast(`${p?.name || "Item"} added to cart`);
}

function removeFromCart(key) {
  setCart(getCart().filter(i => i.key !== key));
}

function incQty(key) {
  const cart = getCart();
  const it = cart.find(i => i.key === key);
  if (!it) return;
  it.qty = (Number(it.qty) || 1) + 1;
  setCart(cart);
}

function decQty(key) {
  const cart = getCart();
  const it = cart.find(i => i.key === key);
  if (!it) return;
  const next = (Number(it.qty) || 1) - 1;
  if (next <= 0) setCart(cart.filter(i => i.key !== key));
  else {
    it.qty = next;
    setCart(cart);
  }
}

/* Checkout UI */
function togglePaymentUI() {
  const method = getSelectedPayMethod();
  const isMpesa = method === "mpesa";

  if (els.mpesaBox) els.mpesaBox.classList.toggle("is-hidden", !isMpesa);
  if (els.cashBox) els.cashBox.classList.toggle("is-hidden", isMpesa);
}

function toggleFulfillmentUI() {
  const fulfillment = getSelectedFulfillmentMethod();
  const isDelivery = fulfillment === "delivery";

  if (els.pickupBox) els.pickupBox.classList.toggle("is-hidden", isDelivery);
  if (els.deliveryBox) els.deliveryBox.classList.toggle("is-hidden", !isDelivery);

  updateStep3Visibility();
  updateTotalsUI();
}

function updateStep3Visibility() {
  const payment = getSelectedPayMethod();
  const fulfillment = getSelectedFulfillmentMethod();

  const needsPhone = payment === "mpesa" || fulfillment === "delivery";

  if (els.phoneStepWrap) els.phoneStepWrap.classList.toggle("is-hidden", !needsPhone);

  if (els.nameStepWrap) els.nameStepWrap.classList.add("is-hidden");
  if (els.emailStepWrap) els.emailStepWrap.classList.add("is-hidden");
}

function updateTotalsUI() {
  const subtotal = calcSubtotal();
  const deliveryFee = getDeliveryFee();
  const total = subtotal + deliveryFee;

  if (els.orderSubtotal) els.orderSubtotal.textContent = money(subtotal);
  if (els.deliveryFeeDisplay) els.deliveryFeeDisplay.textContent = money(deliveryFee);
  if (els.orderTotal) els.orderTotal.textContent = money(total);
  if (els.cartPreviewSubtotal) els.cartPreviewSubtotal.textContent = money(subtotal);
}

function getCheckoutPayload() {
  const paymentMethod = getSelectedPayMethod();
  const fulfillmentMethod = getSelectedFulfillmentMethod();

  const rawPhone = cleanPhone(els.customerPhone?.value);
  const customerPhone = normalizeKenyanPhone(rawPhone);

  const payload = {
    customer_name: safeText(els.customerName?.value),
    customer_phone: customerPhone,
    customer_email: safeText(els.customerEmail?.value),
    payment_method: paymentMethod,
    fulfillment_method: fulfillmentMethod,
    pickup_location: fulfillmentMethod === "pickup" ? CONFIG.pickup : "",
    delivery_area: fulfillmentMethod === "delivery" ? safeText(els.deliveryArea?.value) : "",
    delivery_address: fulfillmentMethod === "delivery" ? safeText(els.deliveryAddress?.value) : "",
    delivery_landmark: fulfillmentMethod === "delivery" ? safeText(els.deliveryLandmark?.value) : "",
    subtotal_kes: Math.round(calcSubtotal()),
    delivery_fee_kes: Math.round(getDeliveryFee()),
    total_kes: Math.round(calcOrderTotal()),
    currency: CONFIG.currency,
    status: paymentMethod === "cash" ? "cash_pending" : "pending_payment",
    school_filter: state.school || "",
    items: buildOrderItemsPayload()
  };

  return payload;
}

function validateStep(step) {
  const cart = getCart();
  if (!cart.length) return "No items in cart.";

  const fulfillment = getSelectedFulfillmentMethod();
  const payment = getSelectedPayMethod();
  const phone = normalizeKenyanPhone(cleanPhone(els.customerPhone?.value));

  if (step === 1) {
    if (fulfillment === "delivery") {
      if (!safeText(els.deliveryArea?.value)) return "Please select a delivery area.";
      if (!safeText(els.deliveryAddress?.value)) return "Please enter the delivery location.";
    }
  }

  if (step === 2) {
    if (!payment) return "Please select a payment method.";
  }

  if (step === 3) {
    const needsPhone = payment === "mpesa" || fulfillment === "delivery";
    if (needsPhone) {
      if (!phone) return "Please enter your phone number.";
      if (phone.length < 12) return "Please enter a valid Kenyan phone number.";
    }
    if (payment === "mpesa" && !/^254(7|1)\d{8}$/.test(phone)) {
      return "For M-Pesa, use a valid number like 07... or 01...";
    }
  }

  return "";
}

function updateReviewStep() {
  const fulfillment = getSelectedFulfillmentMethod();
  const payment = getSelectedPayMethod();
  const phone = normalizeKenyanPhone(cleanPhone(els.customerPhone?.value));
  const area = safeText(els.deliveryArea?.value);
  const address = safeText(els.deliveryAddress?.value);
  const landmark = safeText(els.deliveryLandmark?.value);

  if (els.reviewFulfillment) {
    els.reviewFulfillment.textContent = fulfillment === "delivery" ? "Delivery" : "Pickup";
  }

  if (els.reviewPayment) {
    els.reviewPayment.textContent = payment === "mpesa" ? "M-Pesa" : "Cash";
  }

  const showPhone = Boolean(phone);
  if (els.reviewPhoneRow) els.reviewPhoneRow.classList.toggle("is-hidden", !showPhone);
  if (els.reviewPhone) els.reviewPhone.textContent = phone || "-";

  const showArea = fulfillment === "delivery" && Boolean(area);
  if (els.reviewAreaRow) els.reviewAreaRow.classList.toggle("is-hidden", !showArea);
  if (els.reviewArea) els.reviewArea.textContent = area || "-";

  const showAddress = fulfillment === "delivery" && Boolean(address);
  if (els.reviewAddressRow) els.reviewAddressRow.classList.toggle("is-hidden", !showAddress);
  if (els.reviewAddress) els.reviewAddress.textContent = address || "-";

  const showLandmark = fulfillment === "delivery" && Boolean(landmark);
  if (els.reviewLandmarkRow) els.reviewLandmarkRow.classList.toggle("is-hidden", !showLandmark);
  if (els.reviewLandmark) els.reviewLandmark.textContent = landmark || "-";
}

function showCheckoutStep(step) {
  checkoutStep = Math.max(1, Math.min(4, Number(step) || 1));

  const steps = [
    els.checkoutStep1,
    els.checkoutStep2,
    els.checkoutStep3,
    els.checkoutStep4
  ];

  steps.forEach((el, index) => {
    const show = index === checkoutStep - 1;
    if (!el) return;
    el.hidden = !show;
    el.classList.toggle("is-hidden", !show);
  });

  const titles = {
    1: "How should we send your order?",
    2: "How would you like to pay?",
    3: "Final details",
    4: "Review your order"
  };

  if (els.checkoutStepTitle) els.checkoutStepTitle.textContent = titles[checkoutStep] || "Checkout";
  if (els.checkoutStepMeta) els.checkoutStepMeta.textContent = `Step ${checkoutStep} of 4`;

  if (els.checkoutBackBtn) els.checkoutBackBtn.classList.toggle("is-hidden", checkoutStep === 1);
  if (els.checkoutNextBtn) els.checkoutNextBtn.classList.toggle("is-hidden", checkoutStep === 4);
  if (els.checkoutBtn) els.checkoutBtn.classList.toggle("is-hidden", checkoutStep !== 4);

  if (checkoutStep === 4) updateReviewStep();
  updateStep3Visibility();
  updateTotalsUI();
}

/* Drawer order list */
function renderOrderPanel() {
  if (!els.orderItems || !els.orderSubtotal) return;

  const cart = getCart();

  if (!cart.length) {
    els.orderItems.innerHTML = `<div style="opacity:.7;padding:8px 0;">No items yet.</div>`;
    if (els.orderSubtotal) els.orderSubtotal.textContent = money(0);
    if (els.deliveryFeeDisplay) els.deliveryFeeDisplay.textContent = money(0);
    if (els.orderTotal) els.orderTotal.textContent = money(0);
    if (els.cartEmpty) els.cartEmpty.hidden = false;
    return;
  }

  if (els.cartEmpty) els.cartEmpty.hidden = true;

  let subtotal = 0;

  els.orderItems.innerHTML = cart.map(item => {
    const p = PRODUCTS.find(x => normalize(x.id) === normalize(item.id));
    const name = p?.name || `Item (${safeText(item.id)})`;
    const qty = Number(item.qty) || 1;
    const unit = Number(item.price) || 0;
    const line = unit * qty;
    subtotal += line;
    const sizeTxt = item.size && item.size !== "-" ? item.size : "—";

    return `
      <div class="order-item">
        <div>
          <div><strong>${escapeHtml(name)}</strong></div>
          <small>Size: ${escapeHtml(sizeTxt)}</small><br/>
          <small>${money(unit)} each</small>
        </div>
        <div class="actions">
          <strong>${money(line)}</strong>
          <div class="mob-stepper">
            <button class="mob-trash" type="button" data-rm="${escapeHtml(item.key)}">🗑</button>
            <button class="mob-btn" type="button" data-dec="${escapeHtml(item.key)}">−</button>
            <span class="mob-qty">${qty}</span>
            <button class="mob-btn" type="button" data-inc="${escapeHtml(item.key)}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  els.orderSubtotal.textContent = money(subtotal);

  els.orderItems.querySelectorAll("[data-rm]").forEach(btn => btn.addEventListener("click", () => removeFromCart(btn.dataset.rm)));
  els.orderItems.querySelectorAll("[data-inc]").forEach(btn => btn.addEventListener("click", () => incQty(btn.dataset.inc)));
  els.orderItems.querySelectorAll("[data-dec]").forEach(btn => btn.addEventListener("click", () => decQty(btn.dataset.dec)));

  updateTotalsUI();
}

function renderCartPreview() {
  if (!els.cartPreviewItems || !els.cartPreviewSubtotal || !els.cartPreviewCount) return;

  const cart = getCart();
  const totalQty = cartCountTotal();
  const subtotal = calcSubtotal();

  els.cartPreviewCount.textContent = String(totalQty);
  els.cartPreviewSubtotal.textContent = money(subtotal);

  if (!cart.length) {
    els.cartPreviewItems.textContent = "No items yet";
    return;
  }

  els.cartPreviewItems.innerHTML = cart.map(item => {
    const p = PRODUCTS.find(x => normalize(x.id) === normalize(item.id));
    const name = p?.name || `Item (${safeText(item.id)})`;
    const qty = Number(item.qty) || 1;
    const unit = Number(item.price) || 0;
    const line = unit * qty;
    const sizeTxt = item.size && item.size !== "-" ? `• ${item.size}` : "";

    return `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.08);">
        <div style="font-weight:800;">${escapeHtml(`${qty}× ${name} ${sizeTxt}`)}</div>
        <div style="font-weight:900;">${money(line)}</div>
      </div>
    `;
  }).join("");
}

function refreshCartBadge() {
  if (!els.cartCount) return;
  els.cartCount.textContent = String(cartCountTotal());
}

function refreshAllCartUIs() {
  refreshCartBadge();
  renderOrderPanel();
  renderCartPreview();
  updateTotalsUI();
}

/* Reviews UI */
function ensureReviewUI() {
  if (reviewState.ui) return reviewState.ui;

  const modalInfo = els.modal?.querySelector(".modal-info") || els.modalDesc?.parentElement;
  if (!modalInfo) return null;

  const wrap = document.createElement("div");
  wrap.id = "modalReviewsBlock";
  wrap.style.marginTop = "14px";
  wrap.style.paddingTop = "14px";
  wrap.style.borderTop = "1px solid rgba(15,28,43,0.08)";

  wrap.innerHTML = `
    <div id="modalReviewsSummary" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      <strong style="font-size:14px;">Reviews</strong>
      <span class="muted" style="font-size:13px;">Loading...</span>
    </div>

    <div id="modalReviewsList" style="display:grid;gap:10px;margin-bottom:12px;"></div>

    <button
      type="button"
      id="modalReviewToggleBtn"
      class="btn ghost"
      style="margin-bottom:12px;"
    >
      Leave a review
    </button>

    <div id="modalReviewFormWrap" class="is-hidden" style="display:none;">
      <div
        style="
          border:1px solid rgba(15,28,43,0.08);
          border-radius:16px;
          padding:12px;
          background:rgba(255,255,255,0.72);
        "
      >
        <div style="font-weight:900;margin-bottom:10px;">Verified purchase review</div>

        <div class="checkout-field">
          <label for="reviewOrderId">Order ID</label>
          <input id="reviewOrderId" type="text" placeholder="Paste your Order ID" autocomplete="off" />
        </div>

        <div class="checkout-field">
          <label for="reviewPhone">Phone Number</label>
          <input id="reviewPhone" type="tel" placeholder="07XXXXXXXX" inputmode="tel" autocomplete="tel" />
        </div>

        <div class="checkout-field">
          <label for="reviewName">Name</label>
          <input id="reviewName" type="text" placeholder="Your name (optional)" autocomplete="name" />
        </div>

        <div class="checkout-field">
          <label for="reviewRating">Rating</label>
          <select id="reviewRating">
            <option value="" selected disabled>Select rating</option>
            <option value="5">5 - Excellent</option>
            <option value="4">4 - Very good</option>
            <option value="3">3 - Good</option>
            <option value="2">2 - Fair</option>
            <option value="1">1 - Poor</option>
          </select>
        </div>

        <div class="checkout-field">
          <label for="reviewText">Review</label>
          <textarea
            id="reviewText"
            rows="4"
            placeholder="Share your experience with this item"
            style="
              width:100%;
              padding:12px 12px;
              border-radius:14px;
              border:1px solid rgba(15,28,43,0.12);
              background:rgba(255,255,255,0.95);
              color:var(--ink);
              outline:none;
              resize:vertical;
              font:inherit;
            "
          ></textarea>
        </div>

        <div id="reviewTurnstileWrap" style="margin-top:12px;"></div>

        <div id="reviewFormMsg" class="muted" style="margin-top:10px;font-size:12px;"></div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          <button type="button" id="reviewSubmitBtn" class="btn primary">Submit review</button>
          <button type="button" id="reviewCancelBtn" class="btn ghost">Cancel</button>
        </div>
      </div>
    </div>
  `;

  modalInfo.appendChild(wrap);

  const ui = {
    wrap,
    summary: wrap.querySelector("#modalReviewsSummary"),
    list: wrap.querySelector("#modalReviewsList"),
    toggleBtn: wrap.querySelector("#modalReviewToggleBtn"),
    formWrap: wrap.querySelector("#modalReviewFormWrap"),
    orderId: wrap.querySelector("#reviewOrderId"),
    phone: wrap.querySelector("#reviewPhone"),
    name: wrap.querySelector("#reviewName"),
    rating: wrap.querySelector("#reviewRating"),
    text: wrap.querySelector("#reviewText"),
    turnstileWrap: wrap.querySelector("#reviewTurnstileWrap"),
    msg: wrap.querySelector("#reviewFormMsg"),
    submitBtn: wrap.querySelector("#reviewSubmitBtn"),
    cancelBtn: wrap.querySelector("#reviewCancelBtn"),
  };

  ui.toggleBtn.addEventListener("click", async () => {
    const hidden = ui.formWrap.style.display === "none";
    if (hidden) {
      ui.formWrap.style.display = "block";
      ui.formWrap.classList.remove("is-hidden");
      prefillReviewForm();
      await mountTurnstileWidget();
    } else {
      hideReviewForm();
    }
  });

  ui.cancelBtn.addEventListener("click", () => {
    hideReviewForm();
  });

  ui.submitBtn.addEventListener("click", submitReviewFromModal);

  reviewState.ui = ui;
  return ui;
}

function prefillReviewForm() {
  const ui = ensureReviewUI();
  if (!ui) return;

  const lastOrderId = safeText(localStorage.getItem(LAST_ORDER_ID_KEY));
  const lastPhone = safeText(localStorage.getItem(LAST_CUSTOMER_PHONE_KEY));
  const drawerPhone = cleanPhone(els.customerPhone?.value);

  if (!ui.orderId.value && lastOrderId) ui.orderId.value = lastOrderId;
  if (!ui.phone.value && drawerPhone) ui.phone.value = drawerPhone;
  if (!ui.phone.value && lastPhone) ui.phone.value = lastPhone;
}

function hideReviewForm() {
  const ui = ensureReviewUI();
  if (!ui) return;
  ui.formWrap.style.display = "none";
  ui.formWrap.classList.add("is-hidden");
  ui.msg.textContent = "";
}

function renderModalReviews(data) {
  const ui = ensureReviewUI();
  if (!ui) return;

  const count = Number(data?.review_count || 0);
  const avg = Number(data?.average_rating || 0);

  ui.summary.innerHTML = `
    <strong style="font-size:14px;">Reviews</strong>
    <span style="color:#F4B400;font-size:20px;letter-spacing:0.06em;">${count > 0 ? starsForRating(avg) : "☆☆☆☆☆"}</span>
    <strong style="font-size:14px;">${count > 0 ? avg.toFixed(1) : "0.0"}</strong>
    <span class="muted" style="font-size:13px;">(${count} review${count === 1 ? "" : "s"})</span>
  `;

  const reviews = Array.isArray(data?.reviews) ? data.reviews : [];
  if (!reviews.length) {
    ui.list.innerHTML = `
      <div
        style="
          border:1px solid rgba(15,28,43,0.08);
          border-radius:14px;
          padding:12px;
          background:#fff;
          color:rgba(15,28,43,0.72);
          font-size:13px;
          line-height:1.6;
        "
      >
        Be the first verified buyer to leave a review for this item.
      </div>
    `;
    return;
  }

  ui.list.innerHTML = reviews.map(r => {
    const dateText = reviewDateText(r.created_at);
    const buyerName = safeText(r.customer_name) || "Verified Buyer";
    return `
      <article
        style="
          border:1px solid rgba(15,28,43,0.08);
          border-radius:14px;
          padding:12px;
          background:#fff;
          box-shadow:0 8px 20px rgba(15,28,43,0.04);
        "
      >
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap;">
          <div>
            <strong style="font-size:14px;">${escapeHtml(buyerName)}</strong>
            ${r.verified_purchase ? `<div style="font-size:12px;color:#0F2F4A;font-weight:800;margin-top:2px;">Verified Buyer</div>` : ``}
          </div>
          <div style="text-align:right;">
            <div style="color:#F4B400;font-size:13px;letter-spacing:0.06em;">${starsForRating(r.rating)}</div>
            ${dateText ? `<div style="font-size:12px;color:rgba(15,28,43,0.58);margin-top:2px;">${escapeHtml(dateText)}</div>` : ``}
          </div>
        </div>
        <p style="margin:0;font-size:13px;line-height:1.65;color:rgba(15,28,43,0.78);">
          ${escapeHtml(r.review_text)}
        </p>
      </article>
    `;
  }).join("");
}

function getCardReviewSummary(productId) {
  const data = reviewState.cache.get(productId);
  return {
    review_count: Number(data?.review_count || 0),
    average_rating: Number(data?.average_rating || 0)
  };
}

async function loadReviewsForProduct(productId) {
  const ui = ensureReviewUI();
  if (!ui) return;

  reviewState.currentProductId = safeText(productId);
  ui.summary.innerHTML = `<strong style="font-size:14px;">Reviews</strong><span class="muted" style="font-size:13px;">Loading...</span>`;
  ui.list.innerHTML = "";
  ui.msg.textContent = "";

  try {
    const data = await apiGetJson(getReviewsUrl(productId));
    reviewState.cache.set(productId, data);
    renderModalReviews(data);
    renderProducts();
  } catch (err) {
    if (err?.status === 404) {
      ui.summary.innerHTML = `<strong style="font-size:14px;">Reviews</strong><span class="muted" style="font-size:13px;">API route not found.</span>`;
      ui.list.innerHTML = `
        <div
          style="
            border:1px solid rgba(15,28,43,0.08);
            border-radius:14px;
            padding:12px;
            background:#fff;
            color:rgba(15,28,43,0.72);
            font-size:13px;
            line-height:1.6;
          "
        >
          Cloudflare is not returning <strong>/api/reviews</strong> yet.
        </div>
      `;
      return;
    }

    ui.summary.innerHTML = `<strong style="font-size:14px;">Reviews</strong><span class="muted" style="font-size:13px;">Could not load reviews.</span>`;
    ui.list.innerHTML = `
      <div
        style="
          border:1px solid rgba(15,28,43,0.08);
          border-radius:14px;
          padding:12px;
          background:#fff;
          color:rgba(15,28,43,0.72);
          font-size:13px;
          line-height:1.6;
        "
      >
        Reviews are temporarily unavailable.
      </div>
    `;
  }
}

async function ensureTurnstileScript() {
  if (window.turnstile) return;
  if (reviewState.scriptPromise) return reviewState.scriptPromise;

  reviewState.scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-basfay-turnstile="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Turnstile.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.basfayTurnstile = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Turnstile."));
    document.head.appendChild(script);
  });

  return reviewState.scriptPromise;
}

async function mountTurnstileWidget() {
  const ui = ensureReviewUI();
  if (!ui || !CONFIG.turnstileSiteKey) return;

  try {
    await ensureTurnstileScript();

    if (window.turnstile && reviewState.widgetId !== null) {
      ui.turnstileWrap.dataset.token = "";
      window.turnstile.reset(reviewState.widgetId);
      return;
    }

    ui.turnstileWrap.innerHTML = "";
    ui.turnstileWrap.dataset.token = "";

    if (window.turnstile) {
      reviewState.widgetId = window.turnstile.render(ui.turnstileWrap, {
        sitekey: CONFIG.turnstileSiteKey,
        theme: "light",
        callback(token) {
          ui.turnstileWrap.dataset.token = token || "";
        },
        "expired-callback"() {
          ui.turnstileWrap.dataset.token = "";
        },
        "error-callback"() {
          ui.turnstileWrap.dataset.token = "";
        }
      });
    }
  } catch (err) {
    ui.msg.textContent = "Could not load review verification. Please refresh and try again.";
  }
}

function resetTurnstileWidget() {
  const ui = ensureReviewUI();
  if (!ui) return;
  ui.turnstileWrap.dataset.token = "";
  if (window.turnstile && reviewState.widgetId !== null) {
    try {
      window.turnstile.reset(reviewState.widgetId);
    } catch {
      // leave it
    }
  }
}

async function submitReviewFromModal() {
  const ui = ensureReviewUI();
  if (!ui) return;

  const productId = safeText(reviewState.currentProductId);
  const orderId = safeText(ui.orderId.value);
  const phone = cleanPhone(ui.phone.value);
  const name = safeText(ui.name.value);
  const rating = Number(ui.rating.value);
  const reviewText = safeText(ui.text.value);
  const turnstileToken = safeText(ui.turnstileWrap.dataset.token);

  if (!productId) {
    ui.msg.textContent = "Product not selected.";
    return;
  }
  if (!orderId) {
    ui.msg.textContent = "Please enter your Order ID.";
    return;
  }
  if (!phone || phone.length < 9) {
    ui.msg.textContent = "Please enter a valid phone number.";
    return;
  }
  if (!rating || rating < 1 || rating > 5) {
    ui.msg.textContent = "Please select a rating.";
    return;
  }
  if (reviewText.length < 8) {
    ui.msg.textContent = "Please write a slightly longer review.";
    return;
  }
  if (!turnstileToken) {
    ui.msg.textContent = "Please complete the verification first.";
    return;
  }

  ui.submitBtn.disabled = true;
  ui.submitBtn.textContent = "Submitting...";
  ui.msg.textContent = "Submitting your review...";

  try {
    await submitReviewRequest({
      product_id: productId,
      order_id: orderId,
      customer_phone: phone,
      customer_name: name,
      rating,
      review_text: reviewText,
      turnstile_token: turnstileToken
    });

    localStorage.setItem(LAST_ORDER_ID_KEY, orderId);
    localStorage.setItem(LAST_CUSTOMER_PHONE_KEY, phone);

    ui.msg.textContent = "Review submitted ✅";
    ui.text.value = "";
    ui.rating.value = "";
    resetTurnstileWidget();
    toast("Review submitted ✅");

    try {
      const refreshed = await apiGetJson(getReviewsUrl(productId));
      reviewState.cache.set(productId, refreshed);
      renderModalReviews(refreshed);
      renderProducts();
    } catch {
      // ignore refresh failure
    }
  } catch (err) {
    if (err?.status === 404) {
      ui.msg.textContent = "Cloudflare review route is missing. Fix backend route first.";
    } else {
      ui.msg.textContent = err.message || "Could not submit review.";
    }
    resetTurnstileWidget();
  } finally {
    ui.submitBtn.disabled = false;
    ui.submitBtn.textContent = "Submit review";
  }
}

/* Render products */
function renderProducts() {
  if (!els.productGrid) return;

  const { sorted, visible } = getVisibleSortedProducts();

  if (els.resultsCount) els.resultsCount.textContent = String(sorted.length);

  if (state.school) {
    document.title = `Shop ${state.school} Uniforms | BASFAY Uniforms Kenya`;
  }

  els.productGrid.innerHTML = "";
  if (els.emptyState) els.emptyState.hidden = sorted.length !== 0;

  visible.forEach((p, index) => els.productGrid.appendChild(productCard(p, index)));

  if (visible.length < sorted.length) {
    els.productGrid.appendChild(createLoadMoreCard(sorted.length, visible.length));
  }

  initRevealAnimations(els.productGrid);
}

function applySort(list) {
  const sort = state.sort;

  const byNameAsc = (a, b) => safeText(a.name).localeCompare(safeText(b.name));
  const byNameDesc = (a, b) => safeText(b.name).localeCompare(safeText(a.name));

  const minPrice = (p) => {
    const base = getProductBasePrice(p);
    return base == null ? 1e15 : base;
  };

  const maxPrice = (p) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (variants.length) {
      return Math.max(...variants.map(v => Number(v.price) || -1));
    }
    if (p.price != null) return Number(p.price);
    if (p.basePrice != null) return Number(p.basePrice);
    return -1;
  };

  if (sort === "name_asc") return [...list].sort(byNameAsc);
  if (sort === "name_desc") return [...list].sort(byNameDesc);
  if (sort === "price_asc") return [...list].sort((a, b) => minPrice(a) - minPrice(b));
  if (sort === "price_desc") return [...list].sort((a, b) => maxPrice(b) - maxPrice(a));

  const featuredScore = (p) => (p.featured ? 10 : 0) + (p.hasPhoto ? 2 : 0);
  return [...list].sort((a, b) => featuredScore(b) - featuredScore(a) || byNameAsc(a, b));
}

function productCard(p, index = 0) {
  const wrap = document.createElement("article");
  wrap.className = "product reveal";

  wrap.classList.add(toTypeClass(p.type));
  if (normalize(p.type) === "tracksuit") wrap.classList.add("product-tracksuit");
  if (normalize(p.type) === "socks") wrap.classList.add("product-socks");

  wrap.style.contentVisibility = "auto";
  wrap.style.containIntrinsicSize = "420px";

  const productUrl = getProductUrl(p);
  wrap.style.cursor = "pointer";

  wrap.addEventListener("click", (e) => {
    const interactive = e.target.closest("button, select, option, a, input, label, textarea");
    if (interactive) return;
    window.location.href = productUrl;
  });

  const media = document.createElement("div");
  media.className = "media";

  const tag = document.createElement("div");
  tag.className = "tag";
  tag.textContent = p.color || "Uniform";
  media.appendChild(tag);

  const mediaLink = document.createElement("a");
  mediaLink.href = productUrl;
  mediaLink.setAttribute("aria-label", `View ${p.name}`);
  mediaLink.style.display = "block";
  mediaLink.style.color = "inherit";
  mediaLink.style.textDecoration = "none";

  if (p.image) {
    const img = document.createElement("img");
    applyResponsiveImage(img, p.image, {
      alt: `${p.name} photo`,
      ...getCardImageOptions(index)
    });
    mediaLink.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.innerHTML = "<div>Image coming soon</div>";
    mediaLink.appendChild(ph);
  }

  media.appendChild(mediaLink);

  const title = document.createElement("h3");
  const titleLink = document.createElement("a");
  titleLink.href = productUrl;
  titleLink.textContent = p.name;
  titleLink.style.color = "inherit";
  titleLink.style.textDecoration = "none";
  title.appendChild(titleLink);

  const reviewSummary = getCardReviewSummary(p.id);
  const reviewCount = reviewSummary.review_count;
  const averageRating = reviewSummary.average_rating;

  const cardRating = document.createElement("div");
  cardRating.style.display = "flex";
  cardRating.style.alignItems = "center";
  cardRating.style.gap = "8px";
  cardRating.style.flexWrap = "wrap";
  cardRating.style.marginTop = "2px";
  cardRating.innerHTML = `
    <span style="color:#B8860B;font-size:13px;letter-spacing:0.06em;line-height:1;">
      ${reviewCount > 0 ? starsForRating(averageRating) : "☆☆☆☆☆"}
    </span>
    <span style="font-size:13px;font-weight:800;color:var(--ink);">
      ${reviewCount > 0 ? averageRating.toFixed(1) : "0.0"}
      <span class="muted">(${reviewCount})</span>
    </span>
  `;

  const variants = Array.isArray(p.variants) ? p.variants : [];
  let selected = null;

  const price = document.createElement("div");
  price.className = "price";
  price.textContent = getProductDisplayPrice(p);

  const sizeWrap = document.createElement("div");
  if (variants.length) {
    const select = document.createElement("select");
    select.className = "size-select";
    select.innerHTML = `<option value="" disabled selected>Select size</option>`;

    const sortedV = [...variants].sort((a, b) => {
      const na = Number(a.size), nb = Number(b.size);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a.size).localeCompare(String(b.size));
    });

    sortedV.forEach(v => {
      const opt = document.createElement("option");
      opt.value = String(v.size);
      opt.textContent = String(v.size);
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const found = sortedV.find(v => String(v.size) === select.value);
      if (!found) return;
      selected = { size: String(found.size), price: Number(found.price) };
      price.textContent = formatMoney(selected.price);
    });

    sizeWrap.appendChild(select);
  }

  const actions = document.createElement("div");
  actions.className = "product-actions";

  const viewBtn = document.createElement("a");
  viewBtn.href = productUrl;
  viewBtn.className = "btn small ghost";
  viewBtn.textContent = "View details";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn small primary";
  addBtn.textContent = "Add to cart";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    if (variants.length) {
      if (!selected) return alert("Please select a size first.");
      addToCart(p.id, selected.size, selected.price, 1);
    } else {
      const fallbackPrice = getProductBasePrice(p);
      if (fallbackPrice == null) return alert("Price on request.");
      addToCart(p.id, "-", fallbackPrice, 1);
    }
  });

  actions.appendChild(viewBtn);
  actions.appendChild(addBtn);

  wrap.appendChild(media);
  wrap.appendChild(title);
  wrap.appendChild(cardRating);
  if (variants.length) wrap.appendChild(sizeWrap);
  wrap.appendChild(price);
  wrap.appendChild(actions);

  return wrap;
}

/* Drawer / modal */
function openDrawer() {
  els.drawer?.setAttribute("aria-hidden", "false");
  showCheckoutStep(1);
}
function closeDrawer() {
  els.drawer?.setAttribute("aria-hidden", "true");
}

function bindModal() {
  els.closeModal?.addEventListener("click", () => {
    els.modal?.setAttribute("aria-hidden", "true");
    hideReviewForm();
  });
  els.modalBackdrop?.addEventListener("click", () => {
    els.modal?.setAttribute("aria-hidden", "true");
    hideReviewForm();
  });
}

async function openModal(productId) {
  const p = PRODUCTS.find(x => normalize(x.id) === normalize(productId));
  if (!p || !els.modal) return;

  els.modalTitle.textContent = p.name;
  els.modalDesc.textContent = p.description || "Durable, comfortable uniform item.";
  renderResponsiveImageInto(els.modalMedia, p.image, `${p.name} photo`, getModalImageOptions());

  const modalBits = [p.color && `Color: ${p.color}`, p.type && `Type: ${p.type}`];
  if (p.school) modalBits.push(`School: ${p.school}`);
  els.modalMeta.textContent = modalBits.filter(Boolean).join(" • ");

  if (els.modalViewDetails) {
    els.modalViewDetails.href = getProductUrl(p);
  }

  const variants = Array.isArray(p.variants) ? p.variants : [];
  let selected = null;

  if (els.modalSizeField && els.modalSize) {
    els.modalSize.innerHTML = `<option value="" selected disabled>Select size</option>`;
    if (variants.length) {
      els.modalSizeField.classList.remove("is-hidden");
      const sorted = [...variants].sort((a, b) => {
        const na = Number(a.size), nb = Number(b.size);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a.size).localeCompare(String(b.size));
      });

      sorted.forEach(v => {
        const opt = document.createElement("option");
        opt.value = String(v.size);
        opt.textContent = String(v.size);
        els.modalSize.appendChild(opt);
      });

      els.modalPrice.textContent = getProductDisplayPrice(p);
      els.modalSize.onchange = () => {
        const found = sorted.find(v => String(v.size) === els.modalSize.value);
        if (!found) return;
        selected = { size: String(found.size), price: Number(found.price) };
        els.modalPrice.textContent = formatMoney(selected.price);
      };
    } else {
      els.modalSizeField.classList.add("is-hidden");
      const fallbackPrice = getProductBasePrice(p);
      els.modalPrice.textContent = fallbackPrice != null ? formatMoney(fallbackPrice) : "";
    }
  }

  els.modalAdd.onclick = () => {
    if (variants.length) {
      if (!selected) return alert("Please select a size first.");
      addToCart(p.id, selected.size, selected.price, 1);
    } else {
      const fallbackPrice = getProductBasePrice(p);
      if (fallbackPrice == null) return alert("Price on request.");
      addToCart(p.id, "-", fallbackPrice, 1);
    }
  };

  ensureReviewUI();
  hideReviewForm();
  await loadReviewsForProduct(p.id);

  els.modal.setAttribute("aria-hidden", "false");
}

function hydrateFiltersOptions() {
  const colors = new Set();
  const types = new Set();

  PRODUCTS.forEach(p => {
    if (p.color) colors.add(p.color);
    if (p.type) types.add(p.type);
  });

  const colorList = ["", ...Array.from(colors).sort()];
  const existing = Array.from(types).filter(Boolean);
  const extras = existing.filter(c => !FUTURE_CATEGORIES.includes(c)).sort();
  const typeList = ["", ...FUTURE_CATEGORIES, ...extras];

  const fillSelect = (selectEl, options, allLabel = "All") => {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    options.forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v === "" ? allLabel : v;
      selectEl.appendChild(o);
    });
  };

  fillSelect(els.colorFilterTop, colorList, "All");
  fillSelect(els.categoryDropdown, typeList, "All");
}

function bindFilters() {
  els.categoryDropdown?.addEventListener("change", () => {
    state.type = els.categoryDropdown.value || "";
    resetVisibleProducts();
    renderProducts();
  });

  els.colorFilterTop?.addEventListener("change", () => {
    state.color = els.colorFilterTop.value || "";
    resetVisibleProducts();
    renderProducts();
  });

  els.sortByTop?.addEventListener("change", () => {
    state.sort = els.sortByTop.value || "featured";
    resetVisibleProducts();
    renderProducts();
  });
}

function bindCart() {
  els.openCart?.addEventListener("click", () => {
    renderOrderPanel();
    openDrawer();
  });

  els.openCartPreview?.addEventListener("click", () => {
    renderOrderPanel();
    openDrawer();
  });

  els.closeDrawer?.addEventListener("click", closeDrawer);
  els.drawerBackdrop?.addEventListener("click", closeDrawer);

  els.clearCart?.addEventListener("click", () => {
    setCart([]);
    showCheckoutStep(1);
  });

  togglePaymentUI();
  toggleFulfillmentUI();
  updateStep3Visibility();
  updateTotalsUI();

  (els.payRadios || []).forEach(r => {
    r.addEventListener("change", () => {
      togglePaymentUI();
      updateStep3Visibility();
      updateReviewStep();
    });
  });

  (els.fulfillmentRadios || []).forEach(r => {
    r.addEventListener("change", () => {
      toggleFulfillmentUI();
      updateReviewStep();
    });
  });

  els.deliveryArea?.addEventListener("change", () => {
    updateTotalsUI();
    updateReviewStep();
  });

  els.deliveryAddress?.addEventListener("input", updateReviewStep);
  els.deliveryLandmark?.addEventListener("input", updateReviewStep);
  els.customerPhone?.addEventListener("input", updateReviewStep);

  els.checkoutNextBtn?.addEventListener("click", () => {
    const err = validateStep(checkoutStep);
    if (err) {
      alert(err);
      return;
    }
    showCheckoutStep(checkoutStep + 1);
  });

  els.checkoutBackBtn?.addEventListener("click", () => {
    showCheckoutStep(checkoutStep - 1);
  });

  els.checkoutBtn?.addEventListener("click", async (e) => {
    e.preventDefault();

    const err = validateStep(3);
    if (err) {
      alert(err);
      showCheckoutStep(3);
      return;
    }

    const payload = {
      ...getCheckoutPayload(),
      note: getSelectedFulfillmentMethod() === "pickup"
        ? `Pickup at ${CONFIG.pickup} | Payment: ${getSelectedPayMethod()}`
        : `Delivery to ${safeText(els.deliveryArea?.value)} | Payment: ${getSelectedPayMethod()}`
    };

    if (!payload.items.length) {
      alert("No items in cart.");
      return;
    }

    if (payload.customer_phone) {
      localStorage.setItem(LAST_CUSTOMER_PHONE_KEY, payload.customer_phone);
    }

    const originalBtnText = els.checkoutBtn.textContent;
    els.checkoutBtn.disabled = true;
    els.checkoutBtn.textContent = payload.payment_method === "mpesa" ? "Sending STK..." : "Placing order...";

    try {
      const orderRes = await apiPostJson("/api/orders", payload);
      const orderId = safeText(orderRes?.orderId || orderRes?.order?.id || orderRes?.id);

      if (orderId) {
        await announceOrderId(orderId);
      }

      if (payload.payment_method === "cash") {
        toast("Order placed ✅");
        alert(orderId
          ? `Order placed successfully.\n\nOrder ID: ${orderId}\nPayment: Cash\nFulfilment: ${payload.fulfillment_method}`
          : `Order placed successfully.\nPayment: Cash\nFulfilment: ${payload.fulfillment_method}`
        );

        setCart([]);
        closeDrawer();
        showCheckoutStep(1);
        return;
      }

      const mpesaPayload = {
        order_id: orderId,
        phone: payload.customer_phone,
        amount_kes: payload.total_kes,
        account_reference: orderId || "BASFAY ORDER",
        transaction_desc: `${CONFIG.businessName} order`
      };

      const mpesaRes = await apiPostJson("/api/mpesa/stkpush", mpesaPayload);

      toast("STK prompt sent ✅");
      alert(
        mpesaRes?.customerMessage ||
        mpesaRes?.response?.CustomerMessage ||
        "M-Pesa prompt sent to your phone. Enter your PIN to complete payment."
      );

      setCart([]);
      closeDrawer();
      showCheckoutStep(1);
    } catch (err2) {
      console.error("Checkout error:", err2);

      const detailedMessage =
        err2?.data?.error ||
        err2?.data?.response?.errorMessage ||
        err2?.data?.response?.ResponseDescription ||
        err2?.data?.response?.CustomerMessage ||
        err2?.message ||
        "Could not place order.";

      alert(detailedMessage);
    } finally {
      els.checkoutBtn.disabled = false;
      els.checkoutBtn.textContent = originalBtnText;
      refreshAllCartUIs();
    }
  });
}

async function loadProducts() {
  const res = await fetch(getProductsJsonPath(), { cache: "default" });
  if (!res.ok) throw new Error("Could not load products.json");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("products.json must be an array");

  PRODUCTS = data
    .map(p => {
      const variants = Array.isArray(p.variants)
        ? p.variants.map(v => ({ size: safeText(v.size), price: Number(v.price) }))
          .filter(v => v.size && !Number.isNaN(v.price))
        : [];

      const image = safeText(p.image);

      return {
        id: safeText(p.id),
        slug: safeText(p.slug) || safeText(p.id),
        name: safeText(p.name),
        color: safeText(p.color),
        type: safeText(p.type),
        pattern: safeText(p.pattern),
        school: safeText(p.school),
        schools: Array.isArray(p.schools) ? p.schools.map(safeText).filter(Boolean) : [],
        price: p.price == null ? null : Number(p.price),
        basePrice: p.basePrice == null ? null : Number(p.basePrice),
        variants,
        image,
        hasPhoto: Boolean(image),
        featured: Boolean(p.featured),
        description: safeText(p.description),
        seoTitle: safeText(p.seoTitle),
        seoDescription: safeText(p.seoDescription),
      };
    })
    .filter(isLiveProductEntry);

  hydrateFiltersOptions();
}

/* Init */
(async function main() {
  try {
    if (els.year) els.year.textContent = String(new Date().getFullYear());

    await loadProducts();
    state.school = getSchoolFromUrl();

    bindFilters();
    bindCart();
    bindModal();

    resetVisibleProducts();
    renderProducts();
    refreshAllCartUIs();
    showCheckoutStep(1);

    window.addEventListener("storage", refreshAllCartUIs);
  } catch (err) {
    console.error("BASFAY app.js error:", err);
    toast("Site error: open Console (F12) to see why.");
  }
})();
