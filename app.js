/* ============================
   BASFAY Catalog Site (Clean UI)
   - Products loaded from products.json
   - Top toolbar: Category dropdown + Color + Sort
   - Sidebar exists but hidden by CSS
   - Order list stored in localStorage
   - WhatsApp order message generator
   - Size dropdown per product card
   - Payment method selector (Cash / M-Pesa)
   - Category dropdown ALWAYS shows all FUTURE_CATEGORIES order
   - ✅ Tracksuit cards = lime theme only
   - ✅ Socks cards = emerald theme only
   ============================ */

const CONFIG = {
  currency: "KES",
  pickup: "Kangemi",
  whatsappNumber: "254119667836",
  businessName: "BASFAY School Uniforms",
};

const FUTURE_CATEGORIES = [
  "Sweater",
  "Shirt",
  "Dress",
  "Socks",
  "Marvin",
  "Tracksuit",
  "Gameskit",
  "PE Shirt",
  "Trousers",
  "School Bag",
  "Shoes",
  "Blazer",
  "Materials",
  "Cardigan",
  "Accessory",
];

const els = {
  year: document.getElementById("year"),

  // top toolbar
  categoryDropdown: document.getElementById("categoryDropdown"),
  colorFilterTop: document.getElementById("colorFilterTop"),
  sortByTop: document.getElementById("sortByTop"),
  resultsCount: document.getElementById("resultsCount"),

  // sidebar filters (kept for compatibility)
  q2: document.getElementById("q2"),
  colorFilter2: document.getElementById("colorFilter2"),
  sortBy2: document.getElementById("sortBy2"),
  clearFilters2: document.getElementById("clearFilters2"),
  scrollToCatalog: document.getElementById("scrollToCatalog"),
  resultsCountSidebar: document.getElementById("resultsCountSidebar"),

  // catalog
  productGrid: document.getElementById("productGrid"),
  emptyState: document.getElementById("emptyState"),

  // drawer/cart
  openCart: document.getElementById("openCart"),
  closeDrawer: document.getElementById("closeDrawer"),
  drawer: document.getElementById("drawer"),
  drawerBackdrop: document.getElementById("drawerBackdrop"),
  cartCount: document.getElementById("cartCount"),
  cartItems: document.getElementById("cartItems"),
  cartEmpty: document.getElementById("cartEmpty"),
  sendWhatsApp: document.getElementById("sendWhatsApp"),
  clearCart: document.getElementById("clearCart"),

  // payment radios (legacy - kept)
  payRadios: document.querySelectorAll('input[name="payMethod"]'),

  // modal
  modal: document.getElementById("modal"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  closeModal: document.getElementById("closeModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalPrice: document.getElementById("modalPrice"),
  modalMeta: document.getElementById("modalMeta"),
  modalDesc: document.getElementById("modalDesc"),
  modalMedia: document.getElementById("modalMedia"),
  modalAdd: document.getElementById("modalAdd"),
  modalOrderNow: document.getElementById("modalOrderNow"),
  modalSizeField: document.getElementById("modalSizeField"),
  modalSize: document.getElementById("modalSize"),
};

let PRODUCTS = [];
let state = { q: "", color: "", type: "", sort: "featured" };
const CART_KEY = "basfay_cart_v1";

/* ======================
   ✅ Checkout state (Phase 1)
   ====================== */
const CHECKOUT_KEY = "basfay_checkout_v1";
const ORDER_ID_KEY = "basfay_order_id_v1";
let checkoutUI = { mounted: false };

function getCheckout() {
  try {
    const raw = localStorage.getItem(CHECKOUT_KEY);
    if (!raw) {
      return {
        step: "cart", // "cart" | "checkout" | "placed"
        name: "",
        phone: "",
        area: "",
        notes: "",
        pay: "mpesa_manual", // mpesa_manual | cash | whatsapp
      };
    }
    const parsed = JSON.parse(raw);
    return {
      step: parsed.step || "cart",
      name: safeText(parsed.name),
      phone: safeText(parsed.phone),
      area: safeText(parsed.area),
      notes: safeText(parsed.notes),
      pay: parsed.pay || "mpesa_manual",
    };
  } catch {
    return {
      step: "cart",
      name: "",
      phone: "",
      area: "",
      notes: "",
      pay: "mpesa_manual",
    };
  }
}
function setCheckout(next) {
  localStorage.setItem(CHECKOUT_KEY, JSON.stringify(next));
  updateCartUI();
}
function clearCheckout() {
  localStorage.removeItem(CHECKOUT_KEY);
  localStorage.removeItem(ORDER_ID_KEY);
}
function getOrCreateOrderId() {
  const existing = safeText(localStorage.getItem(ORDER_ID_KEY));
  if (existing) return existing;
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const id = `BASFAY-${stamp}-${rand}`;
  localStorage.setItem(ORDER_ID_KEY, id);
  return id;
}
function cartSubtotal() {
  return getCart().reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
}
function validPhoneKE(phone) {
  const p = safeText(phone).replace(/\s+/g, "");
  return /^(\+?254|0)(7|1)\d{8}$/.test(p);
}
function payLabel(pay) {
  if (pay === "cash") return "Cash on pickup";
  if (pay === "whatsapp") return "WhatsApp (assist me)";
  return "M-Pesa (manual)";
}

/* ======================
   Helpers
   ====================== */
function safeText(s) {
  return String(s ?? "").trim();
}
function normalize(s) {
  return safeText(s).toLowerCase();
}
function formatMoney(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return "";
  return `${CONFIG.currency} ${Number(amount).toLocaleString("en-KE")}`;
}
function toTypeClass(type) {
  return (
    "type-" +
    normalize(type)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );
}

/* ======================
   Payment selection (legacy - kept)
   ====================== */
function getSelectedPayMethodLabel() {
  const checked = [...(els.payRadios || [])].find((r) => r.checked);
  return checked?.value || "M-Pesa";
}
function bindPayments() {
  (els.payRadios || []).forEach((r) => {
    r.addEventListener("change", () => {
      if (els.sendWhatsApp) els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
    });
  });
}

/* ======================
   WhatsApp helpers
   ====================== */
function buildWhatsAppLink(message) {
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}
function buildGenericWhatsAppMessage() {
  return `Hi ${CONFIG.businessName}, I would like to place an order. Pickup: ${CONFIG.pickup}.`;
}

/* ======================
   CART (size-aware)
   ====================== */
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
function setCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartUI();
}
function cartCountTotal() {
  return getCart().reduce((sum, item) => sum + (item.qty || 0), 0);
}
function addToCart(productId, size, price, qty = 1) {
  const cart = getCart();
  const key = `${productId}__${size}`;
  const found = cart.find((i) => i.key === key);

  if (found) found.qty += qty;
  else cart.push({ key, id: productId, size: String(size), price: Number(price), qty });

  setCart(cart);

  // ✅ CHANGE YOU REQUESTED:
  // DO NOT open drawer automatically. Buyer keeps shopping.
  // openDrawer();

  // If they were mid-checkout, return them to cart step silently
  const co = getCheckout();
  if (co.step !== "cart") setCheckout({ ...co, step: "cart" });
}
function removeFromCart(key) {
  setCart(getCart().filter((i) => i.key !== key));
}
function setQty(key, qty) {
  const cart = getCart();
  const item = cart.find((i) => i.key === key);
  if (!item) return;
  item.qty = Math.max(1, qty);
  setCart(cart);
}

/* ======================
   Filters options
   ====================== */
function hydrateFiltersOptions() {
  const colors = new Set();
  const types = new Set();

  PRODUCTS.forEach((p) => {
    if (p.color) colors.add(p.color);
    if (p.type) types.add(p.type);
  });

  const colorList = ["", ...Array.from(colors).sort()];

  const existing = Array.from(types).filter(Boolean);
  const extras = existing.filter((c) => !FUTURE_CATEGORIES.includes(c)).sort();
  const typeList = ["", ...FUTURE_CATEGORIES, ...extras];

  const fillSelect = (selectEl, options, allLabel = "All") => {
    if (!selectEl) return;
    const current = selectEl.value;
    selectEl.innerHTML = "";
    options.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v === "" ? allLabel : v;
      selectEl.appendChild(opt);
    });
    if (options.includes(current)) selectEl.value = current;
  };

  fillSelect(els.colorFilterTop, colorList, "All");
  fillSelect(els.colorFilter2, colorList, "All");
  fillSelect(els.categoryDropdown, typeList, "All");
}

/* ======================
   Sorting / filtering
   ====================== */
function applySort(list) {
  const sort = state.sort;

  const byNameAsc = (a, b) => safeText(a.name).localeCompare(safeText(b.name));
  const byNameDesc = (a, b) => safeText(b.name).localeCompare(safeText(a.name));

  const minPrice = (p) => {
    if (Array.isArray(p.variants) && p.variants.length) {
      return Math.min(...p.variants.map((v) => Number(v.price) || 1e15));
    }
    return p.price ?? 1e15;
  };
  const maxPrice = (p) => {
    if (Array.isArray(p.variants) && p.variants.length) {
      return Math.max(...p.variants.map((v) => Number(v.price) || -1));
    }
    return p.price ?? -1;
  };

  if (sort === "name_asc") return [...list].sort(byNameAsc);
  if (sort === "name_desc") return [...list].sort(byNameDesc);
  if (sort === "price_asc") return [...list].sort((a, b) => minPrice(a) - minPrice(b));
  if (sort === "price_desc") return [...list].sort((a, b) => maxPrice(b) - maxPrice(a));

  const featuredScore = (p) => (p.featured ? 10 : 0) + (p.hasPhoto ? 2 : 0);
  return [...list].sort((a, b) => featuredScore(b) - featuredScore(a) || byNameAsc(a, b));
}

function matchesFilters(p) {
  const q = normalize(state.q);
  const color = state.color;
  const type = state.type;

  if (color && p.color !== color) return false;
  if (type && p.type !== type) return false;

  if (!q) return true;

  const hay = normalize([p.name, p.color, p.type, p.pattern, p.description].filter(Boolean).join(" "));
  return hay.includes(q);
}

/* ======================
   Render products
   ====================== */
function renderProducts() {
  if (!els.productGrid) return;

  const filtered = PRODUCTS.filter(matchesFilters);
  const sorted = applySort(filtered);

  if (els.resultsCount) els.resultsCount.textContent = String(sorted.length);
  if (els.resultsCountSidebar) els.resultsCountSidebar.textContent = String(sorted.length);

  els.productGrid.innerHTML = "";
  if (els.emptyState) els.emptyState.hidden = sorted.length !== 0;

  sorted.forEach((p) => els.productGrid.appendChild(productCard(p)));
}

/* ======================
   Product card
   ====================== */
function productCard(p) {
  const wrap = document.createElement("article");
  wrap.className = "product";

  wrap.classList.add(toTypeClass(p.type));

  if (p.type === "Tracksuit") wrap.classList.add("product-tracksuit");
  if (p.type === "Socks") wrap.classList.add("product-socks");

  const media = document.createElement("div");
  media.className = "media";

  const tag = document.createElement("div");
  tag.className = "tag";
  tag.textContent = p.color || "Uniform";
  media.appendChild(tag);

  if (p.image) {
    const img = document.createElement("img");
    img.src = p.image;
    img.alt = `${p.name} photo`;
    img.loading = "lazy";
    media.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.innerHTML = `<div>Image coming soon</div>`;
    media.appendChild(ph);
  }

  const title = document.createElement("h3");
  title.textContent = p.name;

  const variants = Array.isArray(p.variants) ? p.variants : [];
  let selected = null;

  const price = document.createElement("div");
  price.className = "price";
  if (!variants.length && p.price != null) price.textContent = formatMoney(p.price);

  const sizeWrap = document.createElement("div");
  if (variants.length) {
    const select = document.createElement("select");
    select.className = "size-select";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select size";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    const sorted = [...variants].sort((a, b) => {
      const na = Number(a.size), nb = Number(b.size);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a.size).localeCompare(String(b.size));
    });

    sorted.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = String(v.size);
      opt.textContent = String(v.size);
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const found = sorted.find((v) => String(v.size) === select.value);
      if (!found) return;
      selected = { size: String(found.size), price: Number(found.price) };
      price.textContent = formatMoney(selected.price);
    });

    sizeWrap.appendChild(select);
  }

  const actions = document.createElement("div");
  actions.className = "product-actions";

  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className = "btn small ghost";
  viewBtn.textContent = "View";
  viewBtn.addEventListener("click", () => openModal(p.id));

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn small primary";
  addBtn.textContent = "Add to order";
  addBtn.addEventListener("click", () => {
    if (variants.length) {
      if (!selected) return alert("Please select a size first.");
      addToCart(p.id, selected.size, selected.price, 1);
    } else {
      if (p.price == null) return alert("Price on request. Please message us on WhatsApp.");
      addToCart(p.id, "-", p.price, 1);
    }
  });

  actions.appendChild(viewBtn);
  actions.appendChild(addBtn);

  wrap.appendChild(media);
  wrap.appendChild(title);
  if (variants.length) wrap.appendChild(sizeWrap);
  wrap.appendChild(price);
  wrap.appendChild(actions);

  media.style.cursor = "pointer";
  media.addEventListener("click", () => openModal(p.id));

  return wrap;
}

/* ======================
   Bind filters
   ====================== */
function bindFilters() {
  els.categoryDropdown?.addEventListener("change", () => {
    state.type = els.categoryDropdown.value || "";
    renderProducts();
  });

  els.colorFilterTop?.addEventListener("change", () => {
    state.color = els.colorFilterTop.value || "";
    if (els.colorFilter2) els.colorFilter2.value = state.color;
    renderProducts();
  });

  els.sortByTop?.addEventListener("change", () => {
    state.sort = els.sortByTop.value || "featured";
    if (els.sortBy2) els.sortBy2.value = state.sort;
    renderProducts();
  });

  els.q2?.addEventListener("input", () => {
    state.q = els.q2.value || "";
    renderProducts();
  });

  els.colorFilter2?.addEventListener("change", () => {
    state.color = els.colorFilter2.value || "";
    if (els.colorFilterTop) els.colorFilterTop.value = state.color;
    renderProducts();
  });

  els.sortBy2?.addEventListener("change", () => {
    state.sort = els.sortBy2.value || "featured";
    if (els.sortByTop) els.sortByTop.value = state.sort;
    renderProducts();
  });

  els.clearFilters2?.addEventListener("click", () => {
    state = { q: "", color: "", type: "", sort: "featured" };
    if (els.q2) els.q2.value = "";
    if (els.colorFilter2) els.colorFilter2.value = "";
    if (els.colorFilterTop) els.colorFilterTop.value = "";
    if (els.categoryDropdown) els.categoryDropdown.value = "";
    if (els.sortBy2) els.sortBy2.value = "featured";
    if (els.sortByTop) els.sortByTop.value = "featured";
    renderProducts();
  });

  els.scrollToCatalog?.addEventListener("click", () => {
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* ======================
   Checkout UI injected into drawer (no HTML edits)
   ====================== */
function ensureCheckoutUI() {
  if (!els.cartItems) return;

  if (checkoutUI.mounted) {
    syncCheckoutUIFromState();
    return;
  }

  const host = document.createElement("div");
  host.id = "checkoutPanel";
  host.className = "card";
  host.style.marginTop = "12px";
  host.style.display = "none";

  host.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <strong style="font-size:14px;">Checkout</strong>
      <span class="chip" id="orderIdChip"></span>
    </div>

    <div class="muted" style="margin-top:6px;font-size:12px;">
      Confirm your details, then choose a payment method.
    </div>

    <div style="display:grid;gap:8px;margin-top:10px;">
      <label class="muted" style="font-size:12px;">
        Name
        <input id="coName" type="text" placeholder="Your name" style="width:100%;margin-top:4px;" />
      </label>

      <label class="muted" style="font-size:12px;">
        Phone (M-Pesa number)
        <input id="coPhone" type="tel" placeholder="07.. or 2547.." style="width:100%;margin-top:4px;" />
      </label>

      <label class="muted" style="font-size:12px;">
        Delivery area (optional)
        <input id="coArea" type="text" placeholder="e.g. Westlands / Rongai" style="width:100%;margin-top:4px;" />
      </label>

      <label class="muted" style="font-size:12px;">
        Notes (optional)
        <input id="coNotes" type="text" placeholder="Any instructions?" style="width:100%;margin-top:4px;" />
      </label>
    </div>

    <div style="margin-top:10px;">
      <div class="muted" style="font-size:12px;margin-bottom:6px;">Payment method</div>

      <label style="display:flex;gap:8px;align-items:center;margin:6px 0;">
        <input type="radio" name="coPay" value="mpesa_manual" />
        <span>M-Pesa (manual)</span>
      </label>

      <label style="display:flex;gap:8px;align-items:center;margin:6px 0;">
        <input type="radio" name="coPay" value="cash" />
        <span>Cash on pickup</span>
      </label>

      <label style="display:flex;gap:8px;align-items:center;margin:6px 0;">
        <input type="radio" name="coPay" value="whatsapp" />
        <span>WhatsApp (assist me)</span>
      </label>
    </div>

    <div id="coInstructions" class="muted" style="margin-top:10px;font-size:12px;line-height:1.35;"></div>

    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      <button id="coBack" type="button" class="btn small ghost">Back to cart</button>
      <button id="coConfirm" type="button" class="btn small primary">Place order</button>
    </div>
  `;

  els.cartItems.insertAdjacentElement("afterend", host);

  checkoutUI.host = host;
  checkoutUI.orderIdChip = host.querySelector("#orderIdChip");
  checkoutUI.name = host.querySelector("#coName");
  checkoutUI.phone = host.querySelector("#coPhone");
  checkoutUI.area = host.querySelector("#coArea");
  checkoutUI.notes = host.querySelector("#coNotes");
  checkoutUI.instructions = host.querySelector("#coInstructions");
  checkoutUI.payRadios = host.querySelectorAll('input[name="coPay"]');
  checkoutUI.back = host.querySelector("#coBack");
  checkoutUI.confirm = host.querySelector("#coConfirm");

  checkoutUI.name.addEventListener("input", () => {
    const co = getCheckout();
    setCheckout({ ...co, name: checkoutUI.name.value });
  });
  checkoutUI.phone.addEventListener("input", () => {
    const co = getCheckout();
    setCheckout({ ...co, phone: checkoutUI.phone.value });
  });
  checkoutUI.area.addEventListener("input", () => {
    const co = getCheckout();
    setCheckout({ ...co, area: checkoutUI.area.value });
  });
  checkoutUI.notes.addEventListener("input", () => {
    const co = getCheckout();
    setCheckout({ ...co, notes: checkoutUI.notes.value });
  });

  checkoutUI.payRadios.forEach((r) => {
    r.addEventListener("change", () => {
      const co = getCheckout();
      setCheckout({ ...co, pay: r.value });
    });
  });

  checkoutUI.back.addEventListener("click", () => {
    const co = getCheckout();
    setCheckout({ ...co, step: "cart" });
  });

  checkoutUI.confirm.addEventListener("click", () => {
    const cart = getCart();
    if (!cart.length) return alert("Your cart is empty.");

    const co = getCheckout();
    const name = safeText(co.name);
    const phone = safeText(co.phone);

    if (!name) return alert("Please enter your name.");
    if (!phone) return alert("Please enter your phone number.");
    if (!validPhoneKE(phone)) return alert("Phone number format looks wrong. Use 07.. or 2547..");

    setCheckout({ ...co, step: "placed" });

    if (co.pay === "whatsapp") {
      window.open(buildWhatsAppLink(buildOrderMessage()), "_blank", "noopener,noreferrer");
    }
  });

  checkoutUI.mounted = true;
  syncCheckoutUIFromState();
}

function syncCheckoutUIFromState() {
  if (!checkoutUI.mounted) return;
  const co = getCheckout();
  const hasCart = getCart().length > 0;

  checkoutUI.host.style.display =
    hasCart && (co.step === "checkout" || co.step === "placed") ? "block" : "none";

  checkoutUI.orderIdChip.textContent = hasCart ? getOrCreateOrderId() : "";

  checkoutUI.name.value = co.name || "";
  checkoutUI.phone.value = co.phone || "";
  checkoutUI.area.value = co.area || "";
  checkoutUI.notes.value = co.notes || "";

  checkoutUI.payRadios.forEach((r) => (r.checked = r.value === co.pay));

  const subtotal = formatMoney(cartSubtotal());
  const orderId = getOrCreateOrderId();

  let instructions = "";
  if (co.pay === "mpesa_manual") {
    instructions =
      `Order Total: <strong>${subtotal}</strong><br>` +
      `Payment: <strong>M-Pesa (manual)</strong><br>` +
      `Use reference: <strong>${orderId}</strong><br>` +
      `After paying, you can send the confirmation on WhatsApp for faster processing.`;
  } else if (co.pay === "cash") {
    instructions =
      `Order Total: <strong>${subtotal}</strong><br>` +
      `Payment: <strong>Cash on pickup</strong><br>` +
      `Pickup: <strong>${CONFIG.pickup}</strong><br>` +
      `We’ll confirm pickup details on WhatsApp if needed.`;
  } else {
    instructions =
      `Order Total: <strong>${subtotal}</strong><br>` +
      `Payment: <strong>WhatsApp assistance</strong><br>` +
      `We’ll guide you on payment and delivery once you message us.`;
  }

  if (co.step === "placed") {
    instructions += `<br><br><strong>Status:</strong> Order placed (Phase 1).`;
  }

  checkoutUI.instructions.innerHTML = instructions;
}

/* ======================
   Drawer / Cart UI
   ====================== */
function updateCartUI() {
  const cart = getCart();
  const total = cartCountTotal();
  if (els.cartCount) els.cartCount.textContent = String(total);

  ensureCheckoutUI();

  if (!els.cartItems) return;
  els.cartItems.innerHTML = "";

  if (!cart.length) {
    els.cartEmpty && (els.cartEmpty.hidden = false);

    const co = getCheckout();
    if (co.step !== "cart") setCheckout({ ...co, step: "cart" });

    if (els.sendWhatsApp) {
      els.sendWhatsApp.href = buildWhatsAppLink(buildGenericWhatsAppMessage());
      els.sendWhatsApp.classList.add("is-hidden");
      els.sendWhatsApp.setAttribute("aria-hidden", "true");
    }

    clearCheckout();
    syncCheckoutUIFromState();
    return;
  }

  els.cartEmpty && (els.cartEmpty.hidden = true);

  if (els.sendWhatsApp) {
    els.sendWhatsApp.classList.remove("is-hidden");
    els.sendWhatsApp.setAttribute("aria-hidden", "false");

    const co = getCheckout();

    if (co.step === "cart") {
      els.sendWhatsApp.textContent = "Checkout";
      els.sendWhatsApp.href = "#";
    } else if (co.step === "checkout") {
      els.sendWhatsApp.textContent =
        co.pay === "whatsapp" ? "Send Order on WhatsApp" : "Review payment instructions";
      els.sendWhatsApp.href = co.pay === "whatsapp" ? buildWhatsAppLink(buildOrderMessage()) : "#";
    } else {
      els.sendWhatsApp.textContent = "Send Order on WhatsApp";
      els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
    }
  }

  const chip = (t) => {
    const el = document.createElement("span");
    el.className = "chip";
    el.textContent = t;
    return el;
  };

  cart.forEach((item) => {
    const p = PRODUCTS.find((x) => x.id === item.id);
    if (!p) return;

    const row = document.createElement("div");
    row.className = "cart-item";

    const left = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = item.size && item.size !== "-" ? `${p.name} (Size ${item.size})` : p.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.appendChild(chip(p.color || "Color"));
    meta.appendChild(chip(formatMoney(item.price)));

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    const controls = document.createElement("div");
    controls.className = "cart-controls";

    const minus = document.createElement("button");
    minus.className = "qty-btn";
    minus.type = "button";
    minus.textContent = "−";
    minus.addEventListener("click", () => setQty(item.key, item.qty - 1));

    const qty = document.createElement("div");
    qty.className = "qty";
    qty.textContent = String(item.qty);

    const plus = document.createElement("button");
    plus.className = "qty-btn";
    plus.type = "button";
    plus.textContent = "+";
    plus.addEventListener("click", () => setQty(item.key, item.qty + 1));

    const del = document.createElement("button");
    del.className = "qty-btn";
    del.type = "button";
    del.textContent = "🗑";
    del.addEventListener("click", () => removeFromCart(item.key));

    controls.appendChild(minus);
    controls.appendChild(qty);
    controls.appendChild(plus);
    controls.appendChild(del);

    right.appendChild(controls);

    row.appendChild(left);
    row.appendChild(right);

    els.cartItems.appendChild(row);
  });

  syncCheckoutUIFromState();

  if (els.sendWhatsApp && els.sendWhatsApp.href && els.sendWhatsApp.href !== "#") {
    els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
  }
}

function buildOrderMessage() {
  const cart = getCart();
  const co = getCheckout();
  const orderId = getOrCreateOrderId();

  const lines = [];
  lines.push(`Hi ${CONFIG.businessName}, I would like to order:`);
  lines.push(`Order ID: ${orderId}`);
  lines.push(`Payment method: ${payLabel(co.pay)}`);
  lines.push("");

  cart.forEach((item) => {
    const p = PRODUCTS.find((x) => x.id === item.id);
    if (!p) return;
    const sizeText = item.size && item.size !== "-" ? ` (Size ${item.size})` : "";
    lines.push(`- ${item.qty} × ${p.name}${sizeText} (${formatMoney(item.price)})`);
  });

  lines.push("");
  lines.push(`Subtotal: ${formatMoney(cartSubtotal())}`);
  lines.push(`Pickup: ${CONFIG.pickup}`);

  if (co.name) lines.push(`Name: ${co.name}`);
  if (co.phone) lines.push(`Phone: ${co.phone}`);
  if (co.area) lines.push(`Area: ${co.area}`);
  if (co.notes) lines.push(`Notes: ${co.notes}`);

  lines.push("");
  if (co.pay === "mpesa_manual") {
    lines.push(`I will pay via M-Pesa (manual). Reference: ${orderId}`);
  } else if (co.pay === "cash") {
    lines.push("I will pay cash on pickup.");
  } else {
    lines.push("Please assist me with payment and delivery options.");
  }

  lines.push("");
  lines.push("Thank you.");

  return lines.join("\n");
}

function bindCart() {
  els.openCart?.addEventListener("click", openDrawer);
  els.closeDrawer?.addEventListener("click", closeDrawer);
  els.drawerBackdrop?.addEventListener("click", closeDrawer);

  els.clearCart?.addEventListener("click", () => {
    setCart([]);
    clearCheckout();
  });

  if (els.sendWhatsApp) {
    els.sendWhatsApp.addEventListener("click", (e) => {
      const cart = getCart();
      if (!cart.length) return;

      const co = getCheckout();
      const href = safeText(els.sendWhatsApp.getAttribute("href"));
      const isWhatsAppLink = href.startsWith("https://wa.me/");

      if (co.step === "cart") {
        e.preventDefault();
        setCheckout({ ...co, step: "checkout" });
        openDrawer();
        return;
      }

      if (co.step === "checkout") {
        if (co.pay === "whatsapp" && isWhatsAppLink) return;
        e.preventDefault();
        openDrawer();
        return;
      }

      if (co.step === "placed" && isWhatsAppLink) return;

      e.preventDefault();
      openDrawer();
    });
  }

  if (els.sendWhatsApp) els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
}

function openDrawer() {
  if (!els.drawer) return;
  els.drawer.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  if (!els.drawer) return;
  els.drawer.setAttribute("aria-hidden", "true");
}

/* ======================
   Modal
   ====================== */
function bindModal() {
  els.closeModal?.addEventListener("click", closeModal);
  els.modalBackdrop?.addEventListener("click", closeModal);
}
function openModal(productId) {
  const p = PRODUCTS.find((x) => x.id === productId);
  if (!p || !els.modal) return;

  els.modalTitle.textContent = p.name;

  const bits = [];
  if (p.color) bits.push(`Color: ${p.color}`);
  if (p.type) bits.push(`Type: ${p.type}`);
  if (p.pattern) bits.push(`Pattern: ${p.pattern}`);

  els.modalDesc.textContent = p.description || "Durable, comfortable uniform item. Order via WhatsApp.";

  els.modalMedia.innerHTML = "";
  if (p.image) {
    const img = document.createElement("img");
    img.src = p.image;
    img.alt = `${p.name} photo`;
    els.modalMedia.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.innerHTML = `<div style="font-weight:900;">Image coming soon</div>`;
    els.modalMedia.appendChild(ph);
  }

  const variants = Array.isArray(p.variants) ? p.variants : [];
  let selected = null;

  if (els.modalSizeField && els.modalSize) {
    els.modalSize.innerHTML = `<option value="" selected disabled>Select size</option>`;

    if (variants.length) {
      els.modalSizeField.classList.remove("is-hidden");
      els.modalSizeField.setAttribute("aria-hidden", "false");

      const sorted = [...variants].sort((a, b) => {
        const na = Number(a.size), nb = Number(b.size);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a.size).localeCompare(String(b.size));
      });

      sorted.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = String(v.size);
        opt.textContent = String(v.size);
        els.modalSize.appendChild(opt);
      });

      els.modalPrice.textContent = "";
      els.modalSize.onchange = () => {
        const found = sorted.find((v) => String(v.size) === els.modalSize.value);
        if (!found) return;
        selected = { size: String(found.size), price: Number(found.price) };
        els.modalPrice.textContent = formatMoney(selected.price);
      };
    } else {
      els.modalSizeField.classList.add("is-hidden");
      els.modalSizeField.setAttribute("aria-hidden", "true");
      els.modalPrice.textContent = p.price != null ? formatMoney(p.price) : "";
    }
  } else {
    els.modalPrice.textContent = variants.length ? "" : (p.price != null ? formatMoney(p.price) : "");
  }

  els.modalMeta.textContent = bits.filter(Boolean).join(" • ");

  els.modalAdd.onclick = () => {
    if (variants.length) {
      if (!selected) return alert("Please select a size first.");
      addToCart(p.id, selected.size, selected.price, 1);
    } else {
      if (p.price == null) return alert("Price on request. Please message us on WhatsApp.");
      addToCart(p.id, "-", p.price, 1);
    }
  };

  els.modal.setAttribute("aria-hidden", "false");
}
function closeModal() {
  els.modal?.setAttribute("aria-hidden", "true");
}

/* ======================
   Load products
   ====================== */
async function loadProducts() {
  const res = await fetch("/products.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load products.json");

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("products.json must be an array");

  PRODUCTS = data.map((p) => {
    const variants = Array.isArray(p.variants)
      ? p.variants
          .map((v) => ({ size: safeText(v.size), price: Number(v.price) }))
          .filter((v) => v.size && !Number.isNaN(v.price))
      : [];

    return {
      id: safeText(p.id),
      name: safeText(p.name),
      color: safeText(p.color),
      type: safeText(p.type),
      pattern: safeText(p.pattern),
      price: p.price == null ? null : Number(p.price),
      variants,
      image: safeText(p.image),
      hasPhoto: Boolean(safeText(p.image)),
      featured: Boolean(p.featured),
      description: safeText(p.description),
    };
  });

  hydrateFiltersOptions();
}

/* ======================
   Misc
   ====================== */
function initYear() {
  if (els.year) els.year.textContent = String(new Date().getFullYear());
}
function initKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeDrawer();
    }
  });
}

/* ======================
   Main
   ====================== */
(async function main() {
  initYear();
  bindCart();
  bindModal();
  bindPayments();
  initKeyboard();

  try {
    await loadProducts();
    bindFilters();
    updateCartUI();
    renderProducts();
  } catch (err) {
    console.error(err);
    if (els.productGrid) {
      els.productGrid.innerHTML = `
        <div class="card">
          <strong>Catalog failed to load.</strong>
          <div class="muted">Open DevTools → Console to see the error.</div>
        </div>`;
    }
  }
})();
