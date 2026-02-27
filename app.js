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

  // payment radios
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

/* ✅ NEW: Make a safe CSS class from product type (e.g. "PE Shirt" -> "type-pe-shirt") */
function toTypeClass(type) {
  return (
    "type-" +
    normalize(type)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );
}

/* ✅ NEW: Small toast feedback so "Add to cart" doesn't feel dead */
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
  setTimeout(() => t.remove(), 1100);
}

/* ✅ NEW: Always update cart count even if element was null at load */
function getCartCountEl() {
  return els.cartCount || document.getElementById("cartCount");
}
function refreshCartCount() {
  const total = cartCountTotal();
  const el = getCartCountEl();
  if (el) el.textContent = String(total);
}

/* ======================
   Payment selection
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

/* ✅ UPDATED: No auto-open drawer. Adds toast. Updates count reliably. */
function addToCart(productId, size, price, qty = 1) {
  const cart = getCart();
  const key = `${productId}__${size}`;
  const found = cart.find((i) => i.key === key);

  if (found) found.qty += qty;
  else cart.push({ key, id: productId, size: String(size), price: Number(price), qty });

  // write + update UI
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartUI();

  // feedback
  const p = PRODUCTS.find((x) => x.id === productId);
  toast(`${p?.name || "Item"} added to cart`);
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

  /* ✅ add type class for ALL products so CSS can theme them */
  wrap.classList.add(toTypeClass(p.type));

  // ✅ Special themes only for specific categories (kept intact)
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
  addBtn.textContent = "Add to cart"; // ✅ renamed
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
   Drawer / Cart UI
   ====================== */
function updateCartUI() {
  const cart = getCart();
  refreshCartCount();

  if (!els.cartItems) return;
  els.cartItems.innerHTML = "";

  if (!cart.length) {
    els.cartEmpty && (els.cartEmpty.hidden = false);
    if (els.sendWhatsApp) {
      els.sendWhatsApp.href = buildWhatsAppLink(buildGenericWhatsAppMessage());
      els.sendWhatsApp.classList.add("is-hidden");
      els.sendWhatsApp.setAttribute("aria-hidden", "true");
    }
    return;
  }

  els.cartEmpty && (els.cartEmpty.hidden = true);
  if (els.sendWhatsApp) {
    els.sendWhatsApp.classList.remove("is-hidden");
    els.sendWhatsApp.setAttribute("aria-hidden", "false");
    els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
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

  if (els.sendWhatsApp) els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
}

function buildOrderMessage() {
  const cart = getCart();
  const lines = [];
  const methodText = getSelectedPayMethodLabel();

  lines.push(`Hi ${CONFIG.businessName}, I would like to order:`);
  lines.push(`Payment method: ${methodText}`);
  lines.push("");

  cart.forEach((item) => {
    const p = PRODUCTS.find((x) => x.id === item.id);
    if (!p) return;
    const sizeText = item.size && item.size !== "-" ? ` (Size ${item.size})` : "";
    lines.push(`- ${item.qty} × ${p.name}${sizeText} (${formatMoney(item.price)})`);
  });

  lines.push("");
  lines.push(`Pickup: ${CONFIG.pickup}`);
  lines.push("Delivery: (If needed, share your area and I’ll confirm delivery fee.)");
  lines.push("");
  lines.push("Thank you.");

  return lines.join("\n");
}

function bindCart() {
  els.openCart?.addEventListener("click", openDrawer);
  els.closeDrawer?.addEventListener("click", closeDrawer);
  els.drawerBackdrop?.addEventListener("click", closeDrawer);
  els.clearCart?.addEventListener("click", () => setCart([]));

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
        const na = Number(a.size),
          nb = Number(b.size);
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
    els.modalPrice.textContent = variants.length ? "" : p.price != null ? formatMoney(p.price) : "";
  }

  els.modalMeta.textContent = bits.filter(Boolean).join(" • ");

  if (els.modalAdd) els.modalAdd.textContent = "Add to cart"; // ✅ renamed

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
  // root-absolute path avoids path weirdness
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
