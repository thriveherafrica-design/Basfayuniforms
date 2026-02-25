/* ============================
   BASFAY Catalog Site
   - Products loaded from products.json
   - Filter/search/sort
   - Order list stored in localStorage
   - WhatsApp order message generator
   - ✅ Category dropdown ONLY (tabs removed)
   - ✅ Category order follows products.json order + FUTURE_CATEGORIES order
   - ✅ Payment method selector (Cash / M-Pesa)
   - ✅ Add to order opens drawer (does NOT auto-open WhatsApp)
   - ✅ Size dropdown in cards + modal
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
  "Marvins",
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

  // top filters
  categoryDropdown: document.getElementById("categoryDropdown"),
  qTop: document.getElementById("qTop"),
  colorFilterTop: document.getElementById("colorFilterTop"),
  sortByTop: document.getElementById("sortByTop"),
  clearFiltersTop: document.getElementById("clearFiltersTop"),

  // sidebar filters
  q2: document.getElementById("q2"),
  colorFilter2: document.getElementById("colorFilter2"),
  sortBy2: document.getElementById("sortBy2"),
  clearFilters2: document.getElementById("clearFilters2"),
  scrollToCatalog: document.getElementById("scrollToCatalog"),

  productGrid: document.getElementById("productGrid"),
  emptyState: document.getElementById("emptyState"),
  resultsCount: document.getElementById("resultsCount"),
  resultsCountSidebar: document.getElementById("resultsCountSidebar"),

  // WhatsApp links
  topbarWhatsApp: document.getElementById("topbarWhatsApp"),
  headerWhatsApp: document.getElementById("headerWhatsApp"),
  contactWhatsApp: document.getElementById("contactWhatsApp"),
  footerWhatsApp: document.getElementById("footerWhatsApp"),

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

  // size template + modal size selector
  sizeSelectTemplate: document.getElementById("sizeSelectTemplate"),
  modalSizeField: document.getElementById("modalSizeField"),
  modalSize: document.getElementById("modalSize"),

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
};

let PRODUCTS = [];
let state = {
  q: "",
  color: "",
  type: "", // category
  sort: "featured",
};

const CART_KEY = "basfay_cart_v1";

/* ======================
   Helpers
   ====================== */
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

/* ======================
   WhatsApp helpers
   ====================== */
function buildWhatsAppLink(message) {
  const base = "https://wa.me/";
  const num = CONFIG.whatsappNumber;
  const text = encodeURIComponent(message);
  return `${base}${num}?text=${text}`;
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

/* ======================
   Payment selection
   (Your HTML uses radio name="payMethod" without IDs, so we read by name)
   ====================== */
function getSelectedPayMethod() {
  const checked = document.querySelector('input[name="payMethod"]:checked');
  const val = safeText(checked?.value);
  return /m-?pesa/i.test(val) ? "mpesa" : "cash";
}

/* ======================
   CART (size-aware)
   ====================== */
function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function setCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartUI();
}

function cartCountTotal() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + (item.qty || 0), 0);
}

function addToCart(productId, size, price, qty = 1) {
  const cart = getCart();
  const key = `${productId}__${size}`;
  const found = cart.find(i => i.key === key);

  if (found) found.qty += qty;
  else cart.push({ key, id: productId, size: String(size), price: Number(price), qty });

  setCart(cart);
  openDrawer();
}

function removeFromCart(key) {
  const cart = getCart().filter(i => i.key !== key);
  setCart(cart);
}

function setQty(key, qty) {
  const cart = getCart();
  const item = cart.find(i => i.key === key);
  if (!item) return;
  item.qty = Math.max(1, qty);
  setCart(cart);
}

/* ======================
   Filters options
   - Category order: products.json order, then FUTURE_CATEGORIES order
   ====================== */
function hydrateFiltersOptions() {
  const colors = new Set();
  const typesInOrder = [];
  const seenTypes = new Set();

  PRODUCTS.forEach(p => {
    if (p.color) colors.add(p.color);

    const t = safeText(p.type);
    if (t && !seenTypes.has(t)) {
      seenTypes.add(t);
      typesInOrder.push(t);
    }
  });

  FUTURE_CATEGORIES.forEach(t => {
    const tt = safeText(t);
    if (tt && !seenTypes.has(tt)) {
      seenTypes.add(tt);
      typesInOrder.push(tt);
    }
  });

  const colorList = ["", ...Array.from(colors).sort()];
  const typeList = ["", ...typesInOrder];

  const fillSelect = (selectEl, options, allLabel = "All") => {
    if (!selectEl) return;
    const current = selectEl.value;
    selectEl.innerHTML = "";
    options.forEach(v => {
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
      return Math.min(...p.variants.map(v => Number(v.price) || 1e15));
    }
    return p.price ?? 1e15;
  };
  const maxPrice = (p) => {
    if (Array.isArray(p.variants) && p.variants.length) {
      return Math.max(...p.variants.map(v => Number(v.price) || -1));
    }
    return p.price ?? -1;
  };

  const byPriceAsc = (a, b) => minPrice(a) - minPrice(b);
  const byPriceDesc = (a, b) => maxPrice(b) - maxPrice(a);

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
  els.emptyState.hidden = sorted.length !== 0;

  if (sorted.length === 0 && els.emptyState) {
    const h3 = els.emptyState.querySelector("h3");
    const p = els.emptyState.querySelector("p");

    const typeSelected = safeText(state.type);
    const categoryHasAny = typeSelected
      ? PRODUCTS.some(x => safeText(x.type) === typeSelected)
      : true;

    if (typeSelected && !categoryHasAny) {
      if (h3) h3.textContent = `${typeSelected} coming soon`;
      if (p) p.textContent = "We’ll add items here shortly. Check other categories for now.";
    } else {
      if (h3) h3.textContent = "No matches";
      if (p) p.textContent = "Reset filters or try a broader search.";
    }
  }

  sorted.forEach(p => els.productGrid.appendChild(productCard(p)));
}

function chip(text) {
  const el = document.createElement("span");
  el.className = "chip";
  el.textContent = text;
  return el;
}

function createSizeDropdown(variants) {
  let block;
  let select;

  if (els.sizeSelectTemplate?.content) {
    block = els.sizeSelectTemplate.content.cloneNode(true);
    select = block.querySelector(".size-select");
  } else {
    block = document.createDocumentFragment();
    const lbl = document.createElement("label");
    lbl.className = "size-label";
    lbl.textContent = "Size";
    select = document.createElement("select");
    select.className = "size-select";
    select.required = true;
    block.appendChild(lbl);
    block.appendChild(select);
  }

  if (select) {
    select.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.disabled = true;
    ph.selected = true;
    ph.textContent = "Select size";
    select.appendChild(ph);

    variants.forEach(v => {
      const opt = document.createElement("option");
      opt.value = String(v.size);
      opt.textContent = String(v.size);
      opt.dataset.price = String(Number(v.price));
      select.appendChild(opt);
    });
  }

  return { block, select };
}

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
    ph.innerHTML = `<div>Image coming soon</div>`;
    media.appendChild(ph);
  }

  const title = document.createElement("h3");
  title.textContent = p.name;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.appendChild(chip(p.type || "Item"));
  if (p.pattern) meta.appendChild(chip(p.pattern));

  const variants = Array.isArray(p.variants) ? p.variants : [];
  let selected = null;

  const price = document.createElement("div");
  price.className = "price";

  let sizeBlock = null;
  let sizeSelectEl = null;

  if (variants.length) {
    const sortedVariants = [...variants].sort((a, b) => (Number(a.size) || 0) - (Number(b.size) || 0));
    price.textContent = "Select size";

    const dd = createSizeDropdown(sortedVariants);
    sizeBlock = dd.block;
    sizeSelectEl = dd.select;

    sizeSelectEl?.addEventListener("change", () => {
      const chosen = sizeSelectEl.value;
      const v = sortedVariants.find(x => String(x.size) === String(chosen));
      if (!v) {
        selected = null;
        price.textContent = "Select size";
        return;
      }
      selected = { size: String(v.size), price: Number(v.price) };
      price.textContent = formatMoney(selected.price);
    });
  } else {
    price.textContent = p.price != null ? formatMoney(p.price) : "Price on request";
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
      if (!selected) {
        alert("Please select a size first.");
        sizeSelectEl?.focus();
        return;
      }
      addToCart(p.id, selected.size, selected.price, 1);
    } else {
      if (p.price == null) {
        alert("Price on request. Please message us on WhatsApp to confirm.");
        return;
      }
      addToCart(p.id, "-", p.price, 1);
    }
  });

  actions.appendChild(viewBtn);
  actions.appendChild(addBtn);

  wrap.appendChild(media);
  wrap.appendChild(title);
  wrap.appendChild(meta);
  if (variants.length && sizeBlock) wrap.appendChild(sizeBlock);
  wrap.appendChild(price);
  wrap.appendChild(actions);

  media.style.cursor = "pointer";
  media.addEventListener("click", () => openModal(p.id));

  return wrap;
}

/* ======================
   Filters binding
   ====================== */
function bindFilters() {
  const top = { q: els.qTop, color: els.colorFilterTop, sort: els.sortByTop };
  const side = { q: els.q2, color: els.colorFilter2, sort: els.sortBy2 };

  const syncAll = (from) => {
    if (els.qTop && from.q) els.qTop.value = from.q.value;
    if (els.q2 && from.q) els.q2.value = from.q.value;

    if (els.colorFilterTop && from.color) els.colorFilterTop.value = from.color.value;
    if (els.colorFilter2 && from.color) els.colorFilter2.value = from.color.value;

    if (els.sortByTop && from.sort) els.sortByTop.value = from.sort.value;
    if (els.sortBy2 && from.sort) els.sortBy2.value = from.sort.value;
  };

  const applyFrom = (source) => {
    state.q = source.q?.value ?? state.q;
    state.color = source.color?.value ?? state.color;
    state.sort = source.sort?.value ?? state.sort;
    renderProducts();
  };

  const bindSet = (source) => {
    [source.q, source.color, source.sort].forEach(el => {
      if (!el) return;
      el.addEventListener("input", () => {
        syncAll(source);
        applyFrom(source);
      });
      el.addEventListener("change", () => {
        syncAll(source);
        applyFrom(source);
      });
    });
  };

  bindSet(top);
  bindSet(side);

  // ✅ Category dropdown drives category filtering
  els.categoryDropdown?.addEventListener("change", () => {
    state.type = els.categoryDropdown.value || "";
    renderProducts();
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const clearAll = () => {
    state.q = "";
    state.color = "";
    state.type = "";
    state.sort = "featured";

    if (els.qTop) els.qTop.value = "";
    if (els.q2) els.q2.value = "";

    if (els.colorFilterTop) els.colorFilterTop.value = "";
    if (els.colorFilter2) els.colorFilter2.value = "";

    if (els.sortByTop) els.sortByTop.value = "featured";
    if (els.sortBy2) els.sortBy2.value = "featured";

    if (els.categoryDropdown) els.categoryDropdown.value = "";

    renderProducts();
  };

  els.clearFiltersTop?.addEventListener("click", clearAll);
  els.clearFilters2?.addEventListener("click", clearAll);

  els.scrollToCatalog?.addEventListener("click", () => {
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  applyFrom(top);
}

/* ======================
   Drawer / Cart UI
   ====================== */
function updateCartUI() {
  const cart = getCart();
  const total = cartCountTotal();
  if (els.cartCount) els.cartCount.textContent = String(total);

  if (!els.cartItems) return;

  els.cartItems.innerHTML = "";

  if (!cart.length) {
    els.cartEmpty.hidden = false;

    if (els.sendWhatsApp) {
      els.sendWhatsApp.classList.add("is-hidden");
      els.sendWhatsApp.setAttribute("aria-hidden", "true");
      els.sendWhatsApp.href = buildWhatsAppLink(buildGenericWhatsAppMessage());
    }
    return;
  }

  els.cartEmpty.hidden = true;

  if (els.sendWhatsApp) {
    els.sendWhatsApp.classList.remove("is-hidden");
    els.sendWhatsApp.setAttribute("aria-hidden", "false");
    els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
  }

  cart.forEach(item => {
    const p = PRODUCTS.find(x => x.id === item.id);
    if (!p) return;

    const row = document.createElement("div");
    row.className = "cart-item";

    const left = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = item.size && item.size !== "-" ? `${p.name} (Size ${item.size})` : p.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.appendChild(chip(p.color || "Color"));
    meta.appendChild(chip(p.type || "Item"));
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

  if (els.sendWhatsApp) {
    els.sendWhatsApp.href = buildWhatsAppLink(buildOrderMessage());
  }
}

function buildOrderMessage() {
  const cart = getCart();
  const lines = [];
  const methodText = getSelectedPayMethod() === "mpesa" ? "M-Pesa" : "Cash";

  lines.push(`Hi ${CONFIG.businessName}, I would like to order:`);
  lines.push(`Payment method: ${methodText}`);
  lines.push("");

  if (!cart.length) {
    lines.push("- (No items selected yet)");
  } else {
    cart.forEach(item => {
      const p = PRODUCTS.find(x => x.id === item.id);
      if (!p) return;
      const sizeText = item.size && item.size !== "-" ? ` (Size ${item.size})` : "";
      lines.push(`- ${item.qty} × ${p.name}${sizeText} (${formatMoney(item.price)})`);
    });
  }

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
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  if (!els.drawer) return;
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
}

/* ======================
   Modal (size dropdown)
   ====================== */
function bindModal() {
  els.closeModal?.addEventListener("click", closeModal);
  els.modalBackdrop?.addEventListener("click", closeModal);
}

function openModal(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p || !els.modal) return;

  els.modalTitle.textContent = p.name;

  const variants = Array.isArray(p.variants) ? p.variants : [];
  let selected = null;

  const bits = [];
  if (p.color) bits.push(`Color: ${p.color}`);
  if (p.type) bits.push(`Type: ${p.type}`);
  if (p.pattern) bits.push(`Pattern: ${p.pattern}`);

  els.modalDesc.textContent = p.description || "Durable, comfortable school uniform item. Order via WhatsApp.";

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

  if (els.modalSize) {
    els.modalSize.innerHTML = `<option value="" selected disabled>Select size</option>`;
    els.modalSize.onchange = null;
  }
  if (els.modalSizeField) {
    els.modalSizeField.classList.add("is-hidden");
    els.modalSizeField.setAttribute("aria-hidden", "true");
  }

  if (variants.length) {
    els.modalPrice.textContent = "Select size";

    const sorted = [...variants].sort((a, b) => (Number(a.size) || 0) - (Number(b.size) || 0));

    if (els.modalSizeField) {
      els.modalSizeField.classList.remove("is-hidden");
      els.modalSizeField.setAttribute("aria-hidden", "false");
    }

    if (els.modalSize) {
      sorted.forEach(v => {
        const opt = document.createElement("option");
        opt.value = String(v.size);
        opt.textContent = String(v.size);
        opt.dataset.price = String(Number(v.price));
        els.modalSize.appendChild(opt);
      });
    }

    els.modalMeta.textContent = bits.join(" • ");

    const updateSelected = () => {
      const chosen = els.modalSize?.value || "";
      const v = sorted.find(x => String(x.size) === String(chosen));
      if (!v) {
        selected = null;
        els.modalPrice.textContent = "Select size";
        return;
      }
      selected = { size: String(v.size), price: Number(v.price) };
      els.modalPrice.textContent = formatMoney(selected.price);
    };

    if (els.modalSize) els.modalSize.onchange = updateSelected;

    els.modalAdd.onclick = () => {
      updateSelected();
      if (!selected) {
        alert("Please select a size first.");
        els.modalSize?.focus();
        return;
      }
      addToCart(p.id, selected.size, selected.price, 1);
    };

    els.modalOrderNow.onclick = () => {
      updateSelected();
      if (!selected) {
        alert("Please select a size first.");
        els.modalSize?.focus();
        return;
      }

      const msg = [
        `Hi ${CONFIG.businessName}, I would like to order:`,
        `Payment method: ${getSelectedPayMethod() === "mpesa" ? "M-Pesa" : "Cash"}`,
        ``,
        `- 1 × ${p.name} (Size ${selected.size}) (${formatMoney(selected.price)})`,
        ``,
        `Pickup: ${CONFIG.pickup}`,
        `Delivery: (If needed, share your area and I’ll confirm delivery fee.)`,
        ``,
        `Thank you.`,
      ].join("\n");

      window.open(buildWhatsAppLink(msg), "_blank", "noopener");
    };
  } else {
    els.modalMeta.textContent = bits.join(" • ");
    els.modalPrice.textContent = p.price != null ? formatMoney(p.price) : "Price on request";

    els.modalAdd.onclick = () => {
      if (p.price == null) {
        alert("Price on request. Please message us on WhatsApp to confirm.");
        return;
      }
      addToCart(p.id, "-", p.price, 1);
    };

    els.modalOrderNow.onclick = () => {
      const msg = [
        `Hi ${CONFIG.businessName}, I would like to order:`,
        `Payment method: ${getSelectedPayMethod() === "mpesa" ? "M-Pesa" : "Cash"}`,
        ``,
        `- 1 × ${p.name}${p.price != null ? ` (${formatMoney(p.price)})` : ""}`,
        ``,
        `Pickup: ${CONFIG.pickup}`,
        `Delivery: (If needed, share your area and I’ll confirm delivery fee.)`,
        ``,
        `Thank you.`,
      ].join("\n");

      window.open(buildWhatsAppLink(msg), "_blank", "noopener");
    };
  }

  els.modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (!els.modal) return;

  if (els.modalSizeField) {
    els.modalSizeField.classList.add("is-hidden");
    els.modalSizeField.setAttribute("aria-hidden", "true");
  }
  if (els.modalSize) {
    els.modalSize.innerHTML = `<option value="" selected disabled>Select size</option>`;
    els.modalSize.onchange = null;
  }

  els.modal.setAttribute("aria-hidden", "true");
}

/* ======================
   Load products
   ====================== */
async function loadProducts() {
  const res = await fetch("./products.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load products.json");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("products.json must be an array");

  PRODUCTS = data.map(p => {
    const variants = Array.isArray(p.variants)
      ? p.variants
          .map(v => ({ size: safeText(v.size), price: Number(v.price) }))
          .filter(v => v.size && !Number.isNaN(v.price))
      : [];

    return {
      id: p.id,
      name: safeText(p.name),
      color: safeText(p.color),
      type: safeText(p.type),
      pattern: safeText(p.pattern),
      price: p.price == null ? null : Number(p.price),
      variants,
      image: safeText(p.image),
      hasPhoto: Boolean(p.image),
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
  updateWhatsAppLinks();
  bindCart();
  bindModal();
  initKeyboard();

  try {
    await loadProducts();
    bindFilters();
    updateCartUI();
    renderProducts();
  } catch (err) {
    console.error(err);
    if (els.productGrid) {
      els.productGrid.innerHTML =
        `<div class="card"><strong>Catalog failed to load.</strong><div class="muted">Check that <code>products.json</code> exists beside <code>index.html</code>.</div></div>`;
    }
  }
})();
