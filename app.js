/* ============================
   BASFAY Catalog Site
   - Products loaded from products.json
   - Filter/search/sort
   - Order list stored in localStorage
   - WhatsApp order message generator
   ============================ */

const CONFIG = {
  currency: "KES",
  pickup: "Kangemi",
  whatsappNumber: "254119667836",
  businessName: "BASFAY School Uniforms",
};

const els = {
  year: document.getElementById("year"),

  q: document.getElementById("q"),
  colorFilter: document.getElementById("colorFilter"),
  typeFilter: document.getElementById("typeFilter"),
  sortBy: document.getElementById("sortBy"),
  clearFilters: document.getElementById("clearFilters"),

  q2: document.getElementById("q2"),
  colorFilter2: document.getElementById("colorFilter2"),
  typeFilter2: document.getElementById("typeFilter2"),
  sortBy2: document.getElementById("sortBy2"),
  clearFilters2: document.getElementById("clearFilters2"),
  scrollToCatalog: document.getElementById("scrollToCatalog"),

  productGrid: document.getElementById("productGrid"),
  emptyState: document.getElementById("emptyState"),
  resultsCount: document.getElementById("resultsCount"),

  topbarWhatsApp: document.getElementById("topbarWhatsApp"),
  headerWhatsApp: document.getElementById("headerWhatsApp"),
  contactWhatsApp: document.getElementById("contactWhatsApp"),
  footerWhatsApp: document.getElementById("footerWhatsApp"),

  openCart: document.getElementById("openCart"),
  closeDrawer: document.getElementById("closeDrawer"),
  drawer: document.getElementById("drawer"),
  drawerBackdrop: document.getElementById("drawerBackdrop"),
  cartCount: document.getElementById("cartCount"),
  cartItems: document.getElementById("cartItems"),
  cartEmpty: document.getElementById("cartEmpty"),
  sendWhatsApp: document.getElementById("sendWhatsApp"),
  clearCart: document.getElementById("clearCart"),

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
};

let PRODUCTS = [];
let state = { q: "", color: "", type: "", sort: "featured" };

const CART_KEY = "basfay_cart_v1";

function formatMoney(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return "";
  return `${CONFIG.currency} ${Number(amount).toLocaleString("en-KE")}`;
}

function safeText(s) {
  return String(s ?? "").trim();
}

function normalize(s) {
  return safeText(s).toLowerCase();
}

/** -------- Variant helpers (NEW) -------- */
function getVariantPrices(p) {
  const vs = Array.isArray(p.variants) ? p.variants : [];
  const prices = vs.map(v => Number(v.price)).filter(n => Number.isFinite(n));
  return prices;
}

function getMinMaxPrice(p) {
  // If product has a direct price, use it
  if (p.price != null && Number.isFinite(Number(p.price))) {
    const n = Number(p.price);
    return { min: n, max: n };
  }
  const prices = getVariantPrices(p);
  if (!prices.length) return { min: null, max: null };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function getDisplayPrice(p) {
  const { min, max } = getMinMaxPrice(p);
  if (min == null) return "Price on request";
  if (min === max) return formatMoney(min);
  return `${formatMoney(min)} – ${formatMoney(max)}`;
}

function getAllSizes(p) {
  // Support both old sizes[] and new variants[]
  const fromSizes = Array.isArray(p.sizes) ? p.sizes.map(safeText).filter(Boolean) : [];
  const fromVariants = Array.isArray(p.variants)
    ? p.variants.map(v => safeText(v.size)).filter(Boolean)
    : [];
  const all = [...new Set([...fromSizes, ...fromVariants])];
  return all;
}

function buildSizesPricesLines(p) {
  const vs = Array.isArray(p.variants) ? p.variants : [];
  if (!vs.length) return "";
  // sort by size number if possible
  const sorted = [...vs].sort((a, b) => (Number(a.size) || 0) - (Number(b.size) || 0));
  return sorted
    .map(v => `• ${safeText(v.size)} - ${formatMoney(v.price)}`)
    .join("\n");
}

/** -------- Cart helpers -------- */
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

/** -------- WhatsApp -------- */
function buildWhatsAppLink(message) {
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function buildGenericWhatsAppMessage() {
  return `Hi ${CONFIG.businessName}, I would like to place an order. Pickup: ${CONFIG.pickup}.`;
}

function updateWhatsAppLinks() {
  const link = buildWhatsAppLink(buildGenericWhatsAppMessage());
  for (const el of [els.topbarWhatsApp, els.headerWhatsApp, els.contactWhatsApp, els.footerWhatsApp]) {
    if (el) el.href = link;
  }
}

/** -------- Filters -------- */
function hydrateFiltersOptions() {
  const colors = new Set();
  const types = new Set();

  PRODUCTS.forEach(p => {
    if (p.color) colors.add(p.color);
    if (p.type) types.add(p.type);
  });

  const colorList = ["", ...Array.from(colors).sort()];
  const typeList = ["", ...Array.from(types).sort()];

  const fillSelect = (selectEl, options) => {
    if (!selectEl) return;
    const current = selectEl.value;
    selectEl.innerHTML = "";
    options.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v === "" ? "All" : v;
      selectEl.appendChild(opt);
    });
    if (options.includes(current)) selectEl.value = current;
  };

  fillSelect(els.colorFilter, colorList);
  fillSelect(els.colorFilter2, colorList);

  fillSelect(els.typeFilter, typeList);
  fillSelect(els.typeFilter2, typeList);
}

function applySort(list) {
  const sort = state.sort;

  const byNameAsc = (a, b) => safeText(a.name).localeCompare(safeText(b.name));
  const byNameDesc = (a, b) => safeText(b.name).localeCompare(safeText(a.name));

  // Use minPrice for variant products
  const priceVal = (p) => {
    const { min } = getMinMaxPrice(p);
    return min == null ? 1e15 : min;
  };

  const byPriceAsc = (a, b) => priceVal(a) - priceVal(b);
  const byPriceDesc = (a, b) => priceVal(b) - priceVal(a);

  const featuredScore = (p) => {
    let score = 0;
    if (p.featured) score += 10;
    if (p.hasPhoto) score += 2;
    if (p.type && /sweater|dress|shirt|socks/i.test(p.type)) score += 1;
    return score;
  };

  if (sort === "name_asc") return [...list].sort(byNameAsc);
  if (sort === "name_desc") return [...list].sort(byNameDesc);
  if (sort === "price_asc") return [...list].sort(byPriceAsc);
  if (sort === "price_desc") return [...list].sort(byPriceDesc);

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

function renderProducts() {
  if (!els.productGrid) return;

  const filtered = PRODUCTS.filter(matchesFilters);
  const sorted = applySort(filtered);

  els.resultsCount.textContent = String(sorted.length);

  els.productGrid.innerHTML = "";
  els.emptyState.hidden = sorted.length !== 0;

  sorted.forEach(p => els.productGrid.appendChild(productCard(p)));
}

function chip(text) {
  const el = document.createElement("span");
  el.className = "chip";
  el.textContent = text;
  return el;
}

/** -------- Product card (UPDATED to show variants list) -------- */
function productCard(p) {
  const wrap = document.createElement("article");
  wrap.className = "product";

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
    ph.innerHTML = `<div>Image coming soon</div><div class="muted" style="margin-top:6px;font-weight:750;font-size:12px;">Tap to view details</div>`;
    media.appendChild(ph);
  }

  const title = document.createElement("h3");
  title.textContent = p.name;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.appendChild(chip(p.type || "Item"));
  if (p.pattern) meta.appendChild(chip(p.pattern));

  const allSizes = getAllSizes(p);
  if (allSizes.length) meta.appendChild(chip(`Sizes: ${allSizes.join(", ")}`));

  const price = document.createElement("div");
  price.className = "price";
  price.textContent = getDisplayPrice(p);

  // NEW: sizes+prices list under sweaters (or any item with variants)
  const variantsBlock = document.createElement("div");
  variantsBlock.className = "muted";
  variantsBlock.style.marginTop = "8px";
  variantsBlock.style.whiteSpace = "pre-line";
  variantsBlock.style.fontWeight = "700";
  variantsBlock.style.fontSize = "12px";

  const lines = buildSizesPricesLines(p);
  if (lines) {
    variantsBlock.textContent = `Sizes & Prices:\n${lines}`;
  } else {
    variantsBlock.textContent = ""; // keep empty for non-variant items
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
  addBtn.addEventListener("click", () => addToCart(p.id, 1));

  actions.appendChild(viewBtn);
  actions.appendChild(addBtn);

  wrap.appendChild(media);
  wrap.appendChild(title);
  wrap.appendChild(meta);
  wrap.appendChild(price);
  if (lines) wrap.appendChild(variantsBlock);
  wrap.appendChild(actions);

  media.style.cursor = "pointer";
  media.addEventListener("click", () => openModal(p.id));

  return wrap;
}

/** -------- Filters bindings -------- */
function bindFilters() {
  const syncFromHeroToSidebar = () => {
    if (els.q2) els.q2.value = els.q.value;
    if (els.colorFilter2) els.colorFilter2.value = els.colorFilter.value;
    if (els.typeFilter2) els.typeFilter2.value = els.typeFilter.value;
    if (els.sortBy2) els.sortBy2.value = els.sortBy.value;
  };

  const syncFromSidebarToHero = () => {
    if (els.q) els.q.value = els.q2.value;
    if (els.colorFilter) els.colorFilter.value = els.colorFilter2.value;
    if (els.typeFilter) els.typeFilter.value = els.typeFilter2.value;
    if (els.sortBy) els.sortBy.value = els.sortBy2.value;
  };

  const applyFrom = (source) => {
    state.q = source.q.value;
    state.color = source.color.value;
    state.type = source.type.value;
    state.sort = source.sort.value;
    renderProducts();
  };

  const hero = { q: els.q, color: els.colorFilter, type: els.typeFilter, sort: els.sortBy };
  const side = { q: els.q2, color: els.colorFilter2, type: els.typeFilter2, sort: els.sortBy2 };

  [hero.q, hero.color, hero.type, hero.sort].forEach(el => el && el.addEventListener("input", () => {
    syncFromHeroToSidebar();
    applyFrom(hero);
  }));

  [side.q, side.color, side.type, side.sort].forEach(el => el && el.addEventListener("input", () => {
    syncFromSidebarToHero();
    applyFrom(side);
  }));

  els.clearFilters?.addEventListener("click", () => {
    els.q.value = "";
    els.colorFilter.value = "";
    els.typeFilter.value = "";
    els.sortBy.value = "featured";
    syncFromHeroToSidebar();
    applyFrom(hero);
  });

  els.clearFilters2?.addEventListener("click", () => {
    els.q2.value = "";
    els.colorFilter2.value = "";
    els.typeFilter2.value = "";
    els.sortBy2.value = "featured";
    syncFromSidebarToHero();
    applyFrom(side);
  });

  els.scrollToCatalog?.addEventListener("click", () => {
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  applyFrom(hero);
}

/** -------- Cart -------- */
function addToCart(productId, qty = 1) {
  const cart = getCart();
  const found = cart.find(i => i.id === productId);
  if (found) found.qty += qty;
  else cart.push({ id: productId, qty: qty });

  setCart(cart);
  openDrawer();
}

function removeFromCart(productId) {
  setCart(getCart().filter(i => i.id !== productId));
}

function setQty(productId, qty) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  item.qty = Math.max(1, qty);
  setCart(cart);
}

function updateCartUI() {
  const cart = getCart();
  const total = cartCountTotal();
  if (els.cartCount) els.cartCount.textContent = String(total);

  if (!els.cartItems) return;

  els.cartItems.innerHTML = "";

  if (!cart.length) {
    els.cartEmpty.hidden = false;
    return;
  }
  els.cartEmpty.hidden = true;

  cart.forEach(item => {
    const p = PRODUCTS.find(x => x.id === item.id);
    if (!p) return;

    const row = document.createElement("div");
    row.className = "cart-item";

    const left = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = p.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.appendChild(chip(p.color || "Color"));
    meta.appendChild(chip(p.type || "Item"));
    meta.appendChild(chip(getDisplayPrice(p)));

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    const controls = document.createElement("div");
    controls.className = "cart-controls";

    const minus = document.createElement("button");
    minus.className = "qty-btn";
    minus.type = "button";
    minus.textContent = "−";
    minus.addEventListener("click", () => setQty(p.id, item.qty - 1));

    const qty = document.createElement("div");
    qty.className = "qty";
    qty.textContent = String(item.qty);

    const plus = document.createElement("button");
    plus.className = "qty-btn";
    plus.type = "button";
    plus.textContent = "+";
    plus.addEventListener("click", () => setQty(p.id, item.qty + 1));

    const del = document.createElement("button");
    del.className = "qty-btn";
    del.type = "button";
    del.textContent = "🗑";
    del.addEventListener("click", () => removeFromCart(p.id));

    controls.appendChild(minus);
    controls.appendChild(qty);
    controls.appendChild(plus);
    controls.appendChild(del);

    right.appendChild(controls);

    row.appendChild(left);
    row.appendChild(right);

    els.cartItems.appendChild(row);
  });

  els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
}

function buildOrderMessage() {
  const cart = getCart();
  const lines = [];
  lines.push(`Hi ${CONFIG.businessName}, I would like to order:`);
  lines.push("");

  if (!cart.length) {
    lines.push("- (No items selected yet)");
  } else {
    cart.forEach(item => {
      const p = PRODUCTS.find(x => x.id === item.id);
      if (!p) return;
      const priceStr = ` (${getDisplayPrice(p)})`;
      lines.push(`- ${item.qty} × ${p.name}${priceStr}`);
    });
  }

  lines.push("");
  lines.push(`Pickup: ${CONFIG.pickup}`);
  lines.push("Delivery: (If needed, share your area and I’ll confirm delivery fee.)");
  lines.push("");
  lines.push("Sizes needed (required for sweaters):");
  lines.push("-");
  lines.push("");
  lines.push("Thank you.");

  return lines.join("\n");
}

function bindCart() {
  els.openCart?.addEventListener("click", openDrawer);
  els.closeDrawer?.addEventListener("click", closeDrawer);
  els.drawerBackdrop?.addEventListener("click", closeDrawer);

  els.clearCart?.addEventListener("click", () => setCart([]));

  els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
}

function openDrawer() {
  if (!els.drawer) return;
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  if (!els.drawer) return;
  els.drawer.setAttribute("aria-hidden", "true");
}

/** -------- Modal (UPDATED to show variants) -------- */
function bindModal() {
  els.closeModal?.addEventListener("click", closeModal);
  els.modalBackdrop?.addEventListener("click", closeModal);
}

function openModal(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p || !els.modal) return;

  els.modalTitle.textContent = p.name;
  els.modalPrice.textContent = getDisplayPrice(p);

  const bits = [];
  if (p.color) bits.push(`Color: ${p.color}`);
  if (p.type) bits.push(`Type: ${p.type}`);
  if (p.pattern) bits.push(`Pattern: ${p.pattern}`);
  const allSizes = getAllSizes(p);
  if (allSizes.length) bits.push(`Sizes: ${allSizes.join(", ")}`);
  els.modalMeta.textContent = bits.join(" • ");

  const variantLines = buildSizesPricesLines(p);
  const baseDesc = p.description || "Durable, comfortable school uniform item. Order via WhatsApp.";
  els.modalDesc.textContent = variantLines
    ? `${baseDesc}\n\nSizes & Prices:\n${variantLines}`
    : baseDesc;

  els.modalMedia.innerHTML = "";
  if (p.image) {
    const img = document.createElement("img");
    img.src = p.image;
    img.alt = `${p.name} photo`;
    els.modalMedia.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.innerHTML = `<div style="font-weight:900;">Image coming soon</div><div class="muted" style="margin-top:6px;font-weight:750;font-size:12px;">You can upload this later</div>`;
    els.modalMedia.appendChild(ph);
  }

  els.modalAdd.onclick = () => addToCart(p.id, 1);

  els.modalOrderNow.onclick = () => {
    const msg = [
      `Hi ${CONFIG.businessName}, I would like to order:`,
      ``,
      `- 1 × ${p.name} (${getDisplayPrice(p)})`,
      variantLines ? `` : ``,
      variantLines ? `Sizes & Prices:\n${variantLines}` : ``,
      ``,
      `Pickup: ${CONFIG.pickup}`,
      `Delivery: (If needed, share your area and I’ll confirm delivery fee.)`,
      ``,
      `Size needed:`,
      `-`,
      ``,
      `Thank you.`,
    ].filter(Boolean).join("\n");

    window.open(buildWhatsAppLink(msg), "_blank", "noopener");
  };

  els.modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (!els.modal) return;
  els.modal.setAttribute("aria-hidden", "true");
}

/** -------- Load products (UPDATED to keep variants) -------- */
async function loadProducts() {
  const res = await fetch("./products.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load products.json");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("products.json must be an array");

  PRODUCTS = data.map(p => ({
    id: p.id,
    name: safeText(p.name),
    color: safeText(p.color),
    type: safeText(p.type),
    pattern: safeText(p.pattern),
    sizes: Array.isArray(p.sizes) ? p.sizes.map(safeText).filter(Boolean) : [],
    variants: Array.isArray(p.variants)
      ? p.variants
          .map(v => ({ size: safeText(v.size), price: Number(v.price) }))
          .filter(v => v.size && Number.isFinite(v.price))
      : [],
    price: p.price == null ? null : Number(p.price),
    image: safeText(p.image),
    hasPhoto: Boolean(p.image),
    featured: Boolean(p.featured),
    description: safeText(p.description),
  }));

  hydrateFiltersOptions();
}

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

(async function main() {
  initYear();
  updateWhatsAppLinks();
  bindCart();
  bindModal();
  initKeyboard();

  try {
    await loadProducts();
    bindFilters();
    updateCartUI();
  } catch (err) {
    console.error(err);
    if (els.productGrid) {
      els.productGrid.innerHTML = `<div class="card"><strong>Catalog failed to load.</strong><div class="muted">Check that <code>products.json</code> exists beside <code>index.html</code>.</div></div>`;
    }
  }
})();
