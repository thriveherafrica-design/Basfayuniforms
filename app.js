/* ============================
   BASFAY Catalog Site (Clean UI)
   Cart + Two-step Checkout (Cash vs Till)
   + Desktop "Your Cart" preview (working)
   ✅ Order-first checkout (Daraja-ready): saves order to DB before WhatsApp
   ============================ */

console.log("✅ BASFAY app.js LOADED (WORKING CART PREVIEW)");

const CONFIG = {
  currency: "KES",
  pickup: "Kangemi",
  whatsappNumber: "254119667836",
  businessName: "BASFAY Uniforms",
  tillNumberPlaceholder: "XXXX",
};

const FUTURE_CATEGORIES = [
  "Sweater","Shirt","Dress","Socks","Marvin","Tracksuit","Gameskit","PE Shirt",
  "Trousers","School Bag","Shoes","Blazer","Materials","Cardigan","Accessory",
];

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

  checkoutBtn: document.getElementById("checkoutBtn"),
  customerPhone: document.getElementById("customerPhone"),

  payRadios: document.querySelectorAll('input[name="payMethod"]'),

  // ✅ NEW: needed for Cash/Till behavior
  mpesaBox: document.getElementById("mpesaBox"),
  mpesaCodeWrap: document.getElementById("mpesaCodeWrap"), // wrapped in HTML now

  tillNumberUI: document.getElementById("tillNumberUI"),
  copyTillBtn: document.getElementById("copyTillBtn"),
  copyAmountBtn: document.getElementById("copyAmountBtn"),

  orderItems: document.getElementById("orderItems"),
  orderSubtotal: document.getElementById("orderSubtotal"),

  // ✅ RIGHT "Your Cart"
  cartPreviewCount: document.getElementById("cartPreviewCount"),
  cartPreviewItems: document.getElementById("cartPreviewItems"),
  cartPreviewSubtotal: document.getElementById("cartPreviewSubtotal"),
  openCartPreview: document.getElementById("openCartPreview"),

  // Modal
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
};

let PRODUCTS = [];
let state = { color: "", type: "", sort: "featured" };

const CART_KEY = "basfay_cart_v1";
const CHECKOUT_STEP_KEY = "basfay_checkout_step_v1";

/* ✅ NEW: reuse same order across Till Step 1 -> Step 2 (avoid duplicates) */
const PENDING_ORDER_ID_KEY = "basfay_pending_order_id_v1";

/* Helpers */
function safeText(s){ return String(s ?? "").trim(); }
function normalize(s){ return safeText(s).toLowerCase(); }
function money(n){ return `${CONFIG.currency} ${Number(n || 0).toLocaleString("en-KE")}`; }
function formatMoney(amount){
  if (amount == null || Number.isNaN(Number(amount))) return "";
  return money(Number(amount));
}
function toTypeClass(type){
  return "type-" + normalize(type).replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
}
function cleanPhone(raw){ return safeText(raw).replace(/[^\d+]/g, ""); }

function toast(msg){
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position="fixed";
  t.style.left="50%";
  t.style.bottom="18px";
  t.style.transform="translateX(-50%)";
  t.style.padding="10px 12px";
  t.style.borderRadius="12px";
  t.style.background="rgba(0,0,0,0.88)";
  t.style.color="#fff";
  t.style.fontSize="12px";
  t.style.zIndex="9999";
  t.style.maxWidth="90vw";
  t.style.textAlign="center";
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),900);
}

async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(String(text));
    toast("Copied ✅");
  }catch{
    const ta = document.createElement("textarea");
    ta.value = String(text);
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Copied ✅");
  }
}

/* Checkout step */
function getCheckoutStep(){
  const s = safeText(localStorage.getItem(CHECKOUT_STEP_KEY));
  return s === "checkout" ? "checkout" : "cart";
}
function setCheckoutStep(step){
  localStorage.setItem(CHECKOUT_STEP_KEY, step === "checkout" ? "checkout" : "cart");
}

/* Cart store */
function getCart(){
  try{
    const raw = localStorage.getItem(CART_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch{ return []; }
}

function cartCountTotal(){
  return getCart().reduce((sum,i)=>sum + (Number(i.qty)||0),0);
}

function calcSubtotal(){
  return getCart().reduce((sum,i)=>sum + (Number(i.price)||0)*(Number(i.qty)||0),0);
}

/* ✅ NEW: Save order to DB (Daraja-ready). Never blocks checkout if it fails. */
async function saveOrderToDB(payload){
  try{
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.orderId || null;
  }catch{
    return null;
  }
}

function buildOrderItemsPayload(){
  const cart = getCart();
  return cart.map(item=>{
    const p = PRODUCTS.find(x => normalize(x.id) === normalize(item.id));
    return {
      id: item.id,
      name: p?.name || safeText(item.id),
      size: item.size,
      qty: Number(item.qty)||1,
      price: Number(item.price)||0
    };
  });
}

/* ✅ One setter: updates EVERYTHING */
function setCart(items){
  localStorage.setItem(CART_KEY, JSON.stringify(items));

  // Any cart change invalidates pending order (avoid mismatch)
  localStorage.removeItem(PENDING_ORDER_ID_KEY);

  // Any cart change should reset the step back to cart
  setCheckoutStep("cart");

  refreshAllCartUIs();
}

function addToCart(productId,size,price,qty=1){
  const cart = getCart();
  const key = `${productId}__${size}`;
  const found = cart.find(i=>i.key===key);
  if(found) found.qty = (Number(found.qty)||0) + (Number(qty)||1);
  else cart.push({ key, id: productId, size: String(size), price: Number(price), qty: Number(qty)||1 });

  setCheckoutStep("cart");
  localStorage.removeItem(PENDING_ORDER_ID_KEY);
  setCart(cart);

  const p = PRODUCTS.find(x => normalize(x.id) === normalize(productId));
  toast(`${p?.name || "Item"} added to cart`);
}

function removeFromCart(key){
  setCart(getCart().filter(i=>i.key!==key));
}

function incQty(key){
  const cart = getCart();
  const it = cart.find(i=>i.key===key);
  if(!it) return;
  it.qty = (Number(it.qty)||1) + 1;
  setCart(cart);
}

function decQty(key){
  const cart = getCart();
  const it = cart.find(i=>i.key===key);
  if(!it) return;
  const next = (Number(it.qty)||1) - 1;
  if(next <= 0) setCart(cart.filter(i=>i.key!==key));
  else { it.qty = next; setCart(cart); }
}

/* Payment helpers */
function getPayMethod(){
  const checked = [...(els.payRadios||[])].find(r=>r.checked);
  return checked?.value || "Till";
}

function togglePaymentUI(){
  const method = String(getPayMethod()).toLowerCase();
  const isTill = method === "till";

  // ✅ Cash hides Mpesa box
  if (els.mpesaBox) els.mpesaBox.classList.toggle("is-hidden", !isTill);

  // ✅ Always hide confirmation code wrap (you want it removed)
  if (els.mpesaCodeWrap) els.mpesaCodeWrap.classList.add("is-hidden");
}

function buildWhatsAppLink(message){
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function buildCheckoutWhatsAppMessage(){
  const cart = getCart();
  const phone = cleanPhone(els.customerPhone?.value);
  const subtotal = calcSubtotal();
  const method = getPayMethod();

  const lines = [];
  lines.push(`Hi ${CONFIG.businessName}, I would like to place an order.`);
  if (phone) lines.push(`Phone: ${phone}`);
  lines.push(`Payment: ${method.toLowerCase().includes("cash") ? "Cash" : `M-Pesa Buy Goods (Till: ${CONFIG.tillNumberPlaceholder})`}`);

  if (!method.toLowerCase().includes("cash")) {
    lines.push(`Amount Paid: ${money(subtotal)} (delivery fee to be confirmed)`);
    lines.push(`I will forward/attach the M-Pesa confirmation in this chat.`);
  }

  lines.push("");
  cart.forEach(item=>{
    const p = PRODUCTS.find(x => normalize(x.id) === normalize(item.id));
    const name = p?.name || `Item (${safeText(item.id)})`;
    const sizeText = item.size && item.size !== "-" ? ` (Size ${item.size})` : "";
    const lineTotal = (Number(item.price)||0)*(Number(item.qty)||0);
    lines.push(`- ${item.qty} × ${name}${sizeText} — ${money(lineTotal)}`);
  });

  lines.push("");
  lines.push(`Subtotal: ${money(subtotal)}`);
  lines.push(`Pickup: ${CONFIG.pickup}`);
  lines.push("Please confirm delivery fee and total. Thank you.");
  return lines.join("\n");
}

/* Drawer "Your order" list + Amazon stepper */
function renderOrderPanel(){
  if(!els.orderItems || !els.orderSubtotal) return;

  const cart = getCart();

  if(!cart.length){
    els.orderItems.innerHTML = `<div style="opacity:.7;padding:8px 0;">No items yet.</div>`;
    els.orderSubtotal.textContent = money(0);
    if(els.cartEmpty) els.cartEmpty.hidden = false;
    return;
  }

  if(els.cartEmpty) els.cartEmpty.hidden = true;

  let subtotal = 0;

  els.orderItems.innerHTML = cart.map(item=>{
    const p = PRODUCTS.find(x => normalize(x.id) === normalize(item.id));
    const name = p?.name || `Item (${safeText(item.id)})`;
    const qty = Number(item.qty)||1;
    const unit = Number(item.price)||0;
    const line = unit * qty;
    subtotal += line;
    const sizeTxt = item.size && item.size !== "-" ? item.size : "—";

    return `
      <div class="order-item">
        <div>
          <div><strong>${name}</strong></div>
          <small>Size: ${sizeTxt}</small><br/>
          <small>${money(unit)} each</small>
        </div>
        <div class="actions">
          <strong>${money(line)}</strong>
          <div class="mob-stepper">
            <button class="mob-trash" type="button" data-rm="${item.key}">🗑</button>
            <button class="mob-btn" type="button" data-dec="${item.key}">−</button>
            <span class="mob-qty">${qty}</span>
            <button class="mob-btn" type="button" data-inc="${item.key}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  els.orderSubtotal.textContent = money(subtotal);

  els.orderItems.querySelectorAll("[data-rm]").forEach(btn=>btn.addEventListener("click", ()=>removeFromCart(btn.dataset.rm)));
  els.orderItems.querySelectorAll("[data-inc]").forEach(btn=>btn.addEventListener("click", ()=>incQty(btn.dataset.inc)));
  els.orderItems.querySelectorAll("[data-dec]").forEach(btn=>btn.addEventListener("click", ()=>decQty(btn.dataset.dec)));
}

/* ✅ RIGHT SIDE "Your Cart" (WORKING) */
function renderCartPreview(){
  if(!els.cartPreviewItems || !els.cartPreviewSubtotal || !els.cartPreviewCount) return;

  const cart = getCart();
  const totalQty = cartCountTotal();
  const subtotal = calcSubtotal();

  els.cartPreviewCount.textContent = String(totalQty);
  els.cartPreviewSubtotal.textContent = money(subtotal);

  if(!cart.length){
    els.cartPreviewItems.textContent = "No items yet";
    return;
  }

  els.cartPreviewItems.innerHTML = cart.map(item=>{
    const p = PRODUCTS.find(x => normalize(x.id) === normalize(item.id));
    const name = p?.name || `Item (${safeText(item.id)})`;
    const qty = Number(item.qty)||1;
    const unit = Number(item.price)||0;
    const line = unit * qty;
    const sizeTxt = item.size && item.size !== "-" ? `• ${item.size}` : "";

    return `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.08);">
        <div style="font-weight:800;">${qty}× ${name} ${sizeTxt}</div>
        <div style="font-weight:900;">${money(line)}</div>
      </div>
    `;
  }).join("");
}

/* Badge */
function refreshCartBadge(){
  if(!els.cartCount) return;
  els.cartCount.textContent = String(cartCountTotal());
}

function refreshAllCartUIs(){
  refreshCartBadge();
  renderOrderPanel();
  renderCartPreview();
}

/* Render products */
function renderProducts(){
  if(!els.productGrid) return;

  const filtered = PRODUCTS.filter(p=>{
    if(state.color && p.color !== state.color) return false;
    if(state.type && normalize(p.type) !== normalize(state.type)) return false;
    return true;
  });

  const sorted = applySort(filtered);

  if(els.resultsCount) els.resultsCount.textContent = String(sorted.length);

  els.productGrid.innerHTML = "";
  if(els.emptyState) els.emptyState.hidden = sorted.length !== 0;

  sorted.forEach(p=>els.productGrid.appendChild(productCard(p)));
}

function applySort(list){
  const sort = state.sort;

  const byNameAsc = (a,b)=>safeText(a.name).localeCompare(safeText(b.name));
  const byNameDesc = (a,b)=>safeText(b.name).localeCompare(safeText(a.name));

  const minPrice = (p)=>{
    if(Array.isArray(p.variants)&&p.variants.length) return Math.min(...p.variants.map(v=>Number(v.price)||1e15));
    return p.price ?? 1e15;
  };
  const maxPrice = (p)=>{
    if(Array.isArray(p.variants)&&p.variants.length) return Math.max(...p.variants.map(v=>Number(v.price)||-1));
    return p.price ?? -1;
  };

  if(sort==="name_asc") return [...list].sort(byNameAsc);
  if(sort==="name_desc") return [...list].sort(byNameDesc);
  if(sort==="price_asc") return [...list].sort((a,b)=>minPrice(a)-minPrice(b));
  if(sort==="price_desc") return [...list].sort((a,b)=>maxPrice(b)-maxPrice(a));

  const featuredScore = (p)=> (p.featured?10:0) + (p.hasPhoto?2:0);
  return [...list].sort((a,b)=>featuredScore(b)-featuredScore(a) || byNameAsc(a,b));
}

function productCard(p){
  const wrap = document.createElement("article");
  wrap.className = "product";

  // theme hooks for CSS
  wrap.classList.add(toTypeClass(p.type));
  if (normalize(p.type) === "tracksuit") wrap.classList.add("product-tracksuit");
  if (normalize(p.type) === "socks") wrap.classList.add("product-socks");

  const media = document.createElement("div");
  media.className = "media";

  const tag = document.createElement("div");
  tag.className="tag";
  tag.textContent = p.color || "Uniform";
  media.appendChild(tag);

  if(p.image){
    const img = document.createElement("img");
    img.src=p.image;
    img.alt=`${p.name} photo`;
    img.loading="lazy";
    media.appendChild(img);
  }else{
    const ph = document.createElement("div");
    ph.className="placeholder";
    ph.innerHTML="<div>Image coming soon</div>";
    media.appendChild(ph);
  }

  const title = document.createElement("h3");
  title.textContent = p.name;

  const variants = Array.isArray(p.variants) ? p.variants : [];
  let selected = null;

  const price = document.createElement("div");
  price.className="price";
  if(!variants.length && p.price!=null) price.textContent = formatMoney(p.price);

  const sizeWrap = document.createElement("div");
  if(variants.length){
    const select = document.createElement("select");
    select.className="size-select";
    select.innerHTML = `<option value="" disabled selected>Select size</option>`;

    const sortedV = [...variants].sort((a,b)=>{
      const na=Number(a.size), nb=Number(b.size);
      if(!Number.isNaN(na) && !Number.isNaN(nb)) return na-nb;
      return String(a.size).localeCompare(String(b.size));
    });

    sortedV.forEach(v=>{
      const opt = document.createElement("option");
      opt.value=String(v.size);
      opt.textContent=String(v.size);
      select.appendChild(opt);
    });

    select.addEventListener("change", ()=>{
      const found = sortedV.find(v=>String(v.size)===select.value);
      if(!found) return;
      selected = { size:String(found.size), price:Number(found.price) };
      price.textContent = formatMoney(selected.price);
    });

    sizeWrap.appendChild(select);
  }

  const actions = document.createElement("div");
  actions.className="product-actions";

  const viewBtn = document.createElement("button");
  viewBtn.type="button";
  viewBtn.className="btn small ghost";
  viewBtn.textContent="View";
  viewBtn.addEventListener("click", ()=>openModal(p.id));

  const addBtn = document.createElement("button");
  addBtn.type="button";
  addBtn.className="btn small primary";
  addBtn.textContent="Add to cart";
  addBtn.addEventListener("click", ()=>{
    if(variants.length){
      if(!selected) return alert("Please select a size first.");
      addToCart(p.id, selected.size, selected.price, 1);
    }else{
      if(p.price==null) return alert("Price on request. Please message us on WhatsApp.");
      addToCart(p.id, "-", p.price, 1);
    }
  });

  actions.appendChild(viewBtn);
  actions.appendChild(addBtn);

  wrap.appendChild(media);
  wrap.appendChild(title);
  if(variants.length) wrap.appendChild(sizeWrap);
  wrap.appendChild(price);
  wrap.appendChild(actions);

  return wrap;
}

/* Drawer / modal */
function openDrawer(){ els.drawer?.setAttribute("aria-hidden","false"); }
function closeDrawer(){ els.drawer?.setAttribute("aria-hidden","true"); }

function bindModal(){
  els.closeModal?.addEventListener("click", ()=>els.modal?.setAttribute("aria-hidden","true"));
  els.modalBackdrop?.addEventListener("click", ()=>els.modal?.setAttribute("aria-hidden","true"));
}

function openModal(productId){
  const p = PRODUCTS.find(x => normalize(x.id) === normalize(productId));
  if(!p || !els.modal) return;

  els.modalTitle.textContent = p.name;
  els.modalDesc.textContent = p.description || "Durable, comfortable uniform item.";
  els.modalMedia.innerHTML = p.image ? `<img src="${p.image}" alt="${p.name} photo">` : "";
  els.modalMeta.textContent = [p.color && `Color: ${p.color}`, p.type && `Type: ${p.type}`].filter(Boolean).join(" • ");

  const variants = Array.isArray(p.variants) ? p.variants : [];
  let selected = null;

  if(els.modalSizeField && els.modalSize){
    els.modalSize.innerHTML = `<option value="" selected disabled>Select size</option>`;
    if(variants.length){
      els.modalSizeField.classList.remove("is-hidden");
      const sorted = [...variants].sort((a,b)=>{
        const na=Number(a.size), nb=Number(b.size);
        if(!Number.isNaN(na) && !Number.isNaN(nb)) return na-nb;
        return String(a.size).localeCompare(String(b.size));
      });

      sorted.forEach(v=>{
        const opt = document.createElement("option");
        opt.value = String(v.size);
        opt.textContent = String(v.size);
        els.modalSize.appendChild(opt);
      });

      els.modalPrice.textContent = "";
      els.modalSize.onchange = ()=>{
        const found = sorted.find(v=>String(v.size)===els.modalSize.value);
        if(!found) return;
        selected = { size:String(found.size), price:Number(found.price) };
        els.modalPrice.textContent = formatMoney(selected.price);
      };
    }else{
      els.modalSizeField.classList.add("is-hidden");
      els.modalPrice.textContent = p.price!=null ? formatMoney(p.price) : "";
    }
  }

  els.modalAdd.onclick = ()=>{
    if(variants.length){
      if(!selected) return alert("Please select a size first.");
      addToCart(p.id, selected.size, selected.price, 1);
    }else{
      if(p.price==null) return alert("Price on request. Please message us on WhatsApp.");
      addToCart(p.id, "-", p.price, 1);
    }
  };

  els.modal.setAttribute("aria-hidden","false");
}

function hydrateFiltersOptions(){
  const colors = new Set();
  const types = new Set();

  PRODUCTS.forEach(p=>{
    if(p.color) colors.add(p.color);
    if(p.type) types.add(p.type);
  });

  const colorList = ["", ...Array.from(colors).sort()];
  const existing = Array.from(types).filter(Boolean);
  const extras = existing.filter(c=>!FUTURE_CATEGORIES.includes(c)).sort();
  const typeList = ["", ...FUTURE_CATEGORIES, ...extras];

  const fillSelect = (selectEl, options, allLabel="All")=>{
    if(!selectEl) return;
    selectEl.innerHTML = "";
    options.forEach(v=>{
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v==="" ? allLabel : v;
      selectEl.appendChild(o);
    });
  };

  fillSelect(els.colorFilterTop, colorList, "All");
  fillSelect(els.categoryDropdown, typeList, "All");
}

function bindFilters(){
  els.categoryDropdown?.addEventListener("change", ()=>{
    state.type = els.categoryDropdown.value || "";
    renderProducts();
  });
  els.colorFilterTop?.addEventListener("change", ()=>{
    state.color = els.colorFilterTop.value || "";
    renderProducts();
  });
  els.sortByTop?.addEventListener("change", ()=>{
    state.sort = els.sortByTop.value || "featured";
    renderProducts();
  });
}

function bindCart(){
  els.openCart?.addEventListener("click", ()=>{
    renderOrderPanel();
    openDrawer();
  });

  els.openCartPreview?.addEventListener("click", ()=>{
    renderOrderPanel();
    openDrawer();
  });

  els.closeDrawer?.addEventListener("click", closeDrawer);
  els.drawerBackdrop?.addEventListener("click", closeDrawer);

  els.clearCart?.addEventListener("click", ()=>{
    localStorage.removeItem(PENDING_ORDER_ID_KEY);
    setCheckoutStep("cart");
    setCart([]);
  });

  if (els.tillNumberUI) els.tillNumberUI.textContent = CONFIG.tillNumberPlaceholder;

  // ✅ Ensure correct UI on load
  togglePaymentUI();

  els.copyTillBtn?.addEventListener("click", ()=>copyToClipboard(CONFIG.tillNumberPlaceholder));
  els.copyAmountBtn?.addEventListener("click", ()=>copyToClipboard(String(calcSubtotal())));

  (els.payRadios||[]).forEach(r=>{
    r.addEventListener("change", ()=>{
      togglePaymentUI();
      localStorage.removeItem(PENDING_ORDER_ID_KEY);
      setCheckoutStep("cart");
    });
  });

  // ✅ UPDATED: Order-first checkout (Daraja-ready)
  els.checkoutBtn?.addEventListener("click", async (e)=>{
    e.preventDefault();

    const cart = getCart();
    if(!cart.length){
      toast("No items in cart.");
      return;
    }

    const method = getPayMethod();
    const methodLower = String(method).toLowerCase();

    const phone = cleanPhone(els.customerPhone?.value);
    if(!phone || phone.length < 9){
      alert("Please enter a valid phone number.");
      return;
    }

    const subtotal = calcSubtotal();
    const itemsPayload = buildOrderItemsPayload();

    async function ensureOrderId(noteLabel){
      let existing = safeText(localStorage.getItem(PENDING_ORDER_ID_KEY));
      if(existing) return existing;

      const orderId = await saveOrderToDB({
        customer_name: "",
        customer_phone: phone,
        total_kes: Math.round(subtotal),
        items: itemsPayload,
        note: `Pickup: ${CONFIG.pickup} | ${noteLabel}`
      });

      if(orderId) localStorage.setItem(PENDING_ORDER_ID_KEY, orderId);
      return orderId;
    }

    // ✅ Cash => save order, then WhatsApp immediately
    if(methodLower.includes("cash")){
      localStorage.removeItem(PENDING_ORDER_ID_KEY);
      const orderId = await ensureOrderId("Payment: Cash");

      let msg = buildCheckoutWhatsAppMessage();
      if(orderId) msg += `\n\nOrder ID: ${orderId}`;

      window.open(buildWhatsAppLink(msg), "_blank", "noopener,noreferrer");
      return;
    }

    // ✅ Till => Step 1: show guidance + create order (Daraja-ready)
    if(getCheckoutStep()==="cart"){
      const orderId = await ensureOrderId(`Payment: M-Pesa Till (${CONFIG.tillNumberPlaceholder})`);
      setCheckoutStep("checkout");
      toast(orderId
        ? "Order created ✅ Copy Till + Amount, pay, then tap Proceed to open WhatsApp."
        : "Copy Till + Amount, pay, then tap Proceed to open WhatsApp."
      );
      return;
    }

    // ✅ Till => Step 2: open WhatsApp for now (later: Daraja web payment)
    const orderId = await ensureOrderId(`Payment: M-Pesa Till (${CONFIG.tillNumberPlaceholder})`);

    let msg = buildCheckoutWhatsAppMessage();
    if(orderId) msg += `\n\nOrder ID: ${orderId}`;

    window.open(buildWhatsAppLink(msg), "_blank", "noopener,noreferrer");
  });
}

async function loadProducts(){
  const res = await fetch("./products.json", { cache:"no-store" });
  if(!res.ok) throw new Error("Could not load products.json");
  const data = await res.json();
  if(!Array.isArray(data)) throw new Error("products.json must be an array");

  PRODUCTS = data.map(p=>{
    const variants = Array.isArray(p.variants)
      ? p.variants.map(v=>({ size:safeText(v.size), price:Number(v.price) }))
          .filter(v=>v.size && !Number.isNaN(v.price))
      : [];

    return {
      id: safeText(p.id),
      name: safeText(p.name),
      color: safeText(p.color),
      type: safeText(p.type),
      price: p.price==null ? null : Number(p.price),
      variants,
      image: safeText(p.image),
      hasPhoto: Boolean(safeText(p.image)),
      featured: Boolean(p.featured),
      description: safeText(p.description),
    };
  });

  hydrateFiltersOptions();
}

/* Init */
(async function main(){
  try{
    if (els.year) els.year.textContent = String(new Date().getFullYear());

    await loadProducts();

    bindFilters();
    bindCart();
    bindModal();

    renderProducts();
    refreshAllCartUIs();

    if(!getCart().length) setCheckoutStep("cart");
  }catch(err){
    console.error("BASFAY app.js error:", err);
    toast("Site error: open Console (F12) to see why.");
  }
})();
