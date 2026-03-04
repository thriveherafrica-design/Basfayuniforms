/* ============================
   BASFAY Catalog Site (Clean UI)
   Cart + Two-step Checkout (Cash vs Till)
   + Amazon-like desktop preview (with +/-)
   + Mobile bottom cart bar
   ============================ */

console.log("✅ BASFAY app.js LOADED (AMAZON PREVIEW +/- UPDATED)");

const CONFIG = {
  currency: "KES",
  pickup: "Kangemi",
  whatsappNumber: "254718985676",
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
  cartItems: document.getElementById("cartItems"),
  cartEmpty: document.getElementById("cartEmpty"),
  clearCart: document.getElementById("clearCart"),

  checkoutBtn: document.getElementById("checkoutBtn"),
  customerPhone: document.getElementById("customerPhone"),

  payRadios: document.querySelectorAll('input[name="payMethod"]'),

  tillNumberUI: document.getElementById("tillNumberUI"),
  mpesaBox: document.getElementById("mpesaBox"),
  copyTillBtn: document.getElementById("copyTillBtn"),
  copyAmountBtn: document.getElementById("copyAmountBtn"),
  mpesaCode: document.getElementById("mpesaCode"),

  orderItems: document.getElementById("orderItems"),
  orderSubtotal: document.getElementById("orderSubtotal"),

  // ✅ Cart preview (desktop)
  cartPreviewCount: document.getElementById("cartPreviewCount"),
  cartPreviewItems: document.getElementById("cartPreviewItems"),
  cartPreviewSubtotal: document.getElementById("cartPreviewSubtotal"),
  openCartPreview: document.getElementById("openCartPreview"),

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
let state = { q: "", color: "", type: "", sort: "featured" };

const CART_KEY = "basfay_cart_v1";
const CHECKOUT_STEP_KEY = "basfay_checkout_step_v1";

/* Helpers */
function safeText(s){ return String(s ?? "").trim(); }
function normalize(s){ return safeText(s).toLowerCase(); }

function formatMoney(amount){
  if (amount == null || Number.isNaN(Number(amount))) return "";
  return `${CONFIG.currency} ${Number(amount).toLocaleString("en-KE")}`;
}
function money(n){
  return `${CONFIG.currency} ${Number(n || 0).toLocaleString("en-KE")}`;
}

function toTypeClass(type){
  return "type-" + normalize(type).replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
}

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

function cleanPhone(raw){
  return safeText(raw).replace(/[^\d+]/g, "");
}

function buildWhatsAppLink(message){
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
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

/* Cart storage */
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

/* Mobile cart bar */
function ensureCartBar(){
  if (document.getElementById("cartBar")) return;

  const bar = document.createElement("button");
  bar.id = "cartBar";
  bar.type = "button";
  bar.setAttribute("aria-label", "View cart");
  bar.innerHTML = `
    <div class="cartbar-left"><strong id="cartBarCount">0</strong><span>items</span></div>
    <div class="cartbar-mid"><span style="opacity:.8">Subtotal</span><strong id="cartBarTotal">KES 0</strong></div>
    <div class="cartbar-right"><span>View cart</span><span aria-hidden="true">›</span></div>
  `;
  bar.addEventListener("click", ()=>{
    renderOrderPanel();
    openDrawer();
  });
  document.body.appendChild(bar);
}
function updateCartBar(){
  ensureCartBar();
  const bar = document.getElementById("cartBar");
  const countEl = document.getElementById("cartBarCount");
  const totalEl = document.getElementById("cartBarTotal");

  const count = cartCountTotal();
  const total = calcSubtotal();

  if(countEl) countEl.textContent = String(count);
  if(totalEl) totalEl.textContent = money(total);

  if(bar) bar.style.display = count > 0 ? "flex" : "none";
}

/* ✅ Amazon-like preview (desktop) WITH +/- */
function renderCartPreview(){
  if(!els.cartPreviewItems || !els.cartPreviewSubtotal || !els.cartPreviewCount) return;

  const cart = getCart();
  const subtotal = calcSubtotal();

  els.cartPreviewCount.textContent = String(cartCountTotal());
  els.cartPreviewSubtotal.textContent = money(subtotal);

  if(!cart.length){
    els.cartPreviewItems.textContent = "No items yet";
    return;
  }

  els.cartPreviewItems.innerHTML = cart.map(item=>{
    const p = PRODUCTS.find(x => normalize(x.id) === normalize(item.id));
    const name = p?.name || `Item (${safeText(item.id)})`;
    const sizeTxt = item.size && item.size !== "-" ? `• ${item.size}` : "";
    const line = (Number(item.price)||0) * (Number(item.qty)||0);

    return `
      <div class="cp-line" style="display:grid; gap:10px; padding:10px; border:1px solid rgba(0,0,0,0.08); border-radius:12px; margin-bottom:10px; background:#fff;">
        <div style="display:flex; justify-content:space-between; gap:10px; font-weight:900;">
          <span>${item.qty}× ${name} ${sizeTxt}</span>
          <span>${money(line)}</span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="cp-btn" type="button" data-dec="${item.key}" style="width:34px;height:34px;border-radius:10px;border:1px solid rgba(0,0,0,0.14);background:#fff;cursor:pointer;font-weight:950;">−</button>
            <span class="cp-qty" style="min-width:22px;text-align:center;font-weight:950;">${item.qty}</span>
            <button class="cp-btn" type="button" data-inc="${item.key}" style="width:34px;height:34px;border-radius:10px;border:1px solid rgba(0,0,0,0.14);background:#fff;cursor:pointer;font-weight:950;">+</button>
          </div>

          <button class="cp-remove" type="button" data-rm="${item.key}" style="border:1px solid rgba(0,0,0,0.14);background:#fff;padding:8px 10px;border-radius:10px;cursor:pointer;font-weight:900;">
            Remove
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Bind +
  els.cartPreviewItems.querySelectorAll("[data-inc]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.dataset.inc;
      const cartNow = getCart();
      const it = cartNow.find(i=>i.key===key);
      if(!it) return;
      it.qty = (Number(it.qty)||1) + 1;
      setCart(cartNow);
    });
  });

  // Bind -
  els.cartPreviewItems.querySelectorAll("[data-dec]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.dataset.dec;
      const cartNow = getCart();
      const it = cartNow.find(i=>i.key===key);
      if(!it) return;
      const next = (Number(it.qty)||1) - 1;
      if(next <= 0){
        setCart(cartNow.filter(i=>i.key!==key));
      }else{
        it.qty = next;
        setCart(cartNow);
      }
    });
  });

  // Bind remove
  els.cartPreviewItems.querySelectorAll("[data-rm]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.dataset.rm;
      setCart(getCart().filter(i=>i.key!==key));
    });
  });
}

/* ✅ One refresh to rule them all */
function refreshAllCartUIs(){
  if (els.cartCount) els.cartCount.textContent = String(cartCountTotal());
  updateCartBar();
  renderCartPreview();
  renderOrderPanel();
}

/* Order drawer list */
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
    const line = (Number(item.price)||0) * (Number(item.qty)||0);
    subtotal += line;

    return `
      <div class="order-item">
        <div>
          <div><strong>${name}</strong></div>
          <small>Size: ${item.size || "—"} • Qty: ${item.qty}</small><br/>
          <small>${money(item.price)} each</small>
        </div>
        <div class="actions">
          <strong>${money(line)}</strong>
          <button class="remove" type="button" data-remove="${item.key}">Remove</button>
        </div>
      </div>
    `;
  }).join("");

  els.orderSubtotal.textContent = money(subtotal);

  els.orderItems.querySelectorAll("[data-remove]").forEach(btn=>{
    btn.addEventListener("click", ()=>removeFromCart(btn.dataset.remove));
  });
}

/* Cart setter */
function setCart(items){
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  refreshAllCartUIs();
}

/* Cart actions */
function addToCart(productId,size,price,qty=1){
  const cart = getCart();
  const key = `${productId}__${size}`;

  const found = cart.find(i=>i.key===key);
  if(found) found.qty += qty;
  else cart.push({ key, id: productId, size: String(size), price: Number(price), qty });

  setCheckoutStep("cart");
  setCart(cart);

  const p = PRODUCTS.find(x => normalize(x.id) === normalize(productId));
  toast(`${p?.name || "Item"} added to cart`);
}
function removeFromCart(key){
  setCart(getCart().filter(i=>i.key!==key));
}
function setQty(key,qty){
  const cart = getCart();
  const item = cart.find(i=>i.key===key);
  if(!item) return;
  item.qty = Math.max(1, Number(qty)||1);
  setCart(cart);
}

/* Payment helpers */
function getPayMethod(){
  const checked = [...(els.payRadios||[])].find(r=>r.checked);
  return checked?.value || "Till";
}
function togglePaymentUI(){
  const method = getPayMethod();
  const isTill = method.toLowerCase().includes("till");
  if (els.mpesaBox) els.mpesaBox.classList.toggle("is-hidden", !isTill);
}

/* WhatsApp msg */
function buildCheckoutWhatsAppMessage(){
  const cart = getCart();
  const phone = cleanPhone(els.customerPhone?.value);
  const subtotal = calcSubtotal();
  const method = getPayMethod();
  const mpesaCode = safeText(els.mpesaCode?.value);

  const lines = [];
  lines.push(`Hi ${CONFIG.businessName}, I would like to place an order.`);
  if (phone) lines.push(`Phone: ${phone}`);
  lines.push(`Payment: ${method.toLowerCase().includes("cash") ? "Cash" : `M-Pesa Buy Goods (Till: ${CONFIG.tillNumberPlaceholder})`}`);

  if (!method.toLowerCase().includes("cash")) {
    lines.push(`Amount Paid: ${formatMoney(subtotal)} (delivery fee to be confirmed)`);
    if (mpesaCode) lines.push(`M-Pesa Code: ${mpesaCode}`);
  }

  lines.push("");
  cart.forEach(item=>{
    const p = PRODUCTS.find(x => normalize(x.id) === normalize(item.id));
    const name = p?.name || `Item (${safeText(item.id)})`;
    const sizeText = item.size && item.size !== "-" ? ` (Size ${item.size})` : "";
    const lineTotal = (Number(item.price)||0)*(Number(item.qty)||0);
    lines.push(`- ${item.qty} × ${name}${sizeText} — ${formatMoney(lineTotal)}`);
  });

  lines.push("");
  lines.push(`Subtotal: ${formatMoney(subtotal)}`);
  lines.push(`Pickup: ${CONFIG.pickup}`);
  lines.push("Please confirm delivery fee and total. Thank you.");
  return lines.join("\n");
}

/* Filters */
function hydrateFiltersOptions(){
  const colors = new Set();
  const types = new Set();
  PRODUCTS.forEach(p=>{ if(p.color) colors.add(p.color); if(p.type) types.add(p.type); });

  const colorList = ["", ...Array.from(colors).sort()];
  const existing = Array.from(types).filter(Boolean);
  const extras = existing.filter(c=>!FUTURE_CATEGORIES.includes(c)).sort();
  const typeList = ["", ...FUTURE_CATEGORIES, ...extras];

  const fillSelect = (selectEl, options, allLabel="All")=>{
    if(!selectEl) return;
    const cur = selectEl.value;
    selectEl.innerHTML = "";
    options.forEach(v=>{
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v==="" ? allLabel : v;
      selectEl.appendChild(o);
    });
    if(options.includes(cur)) selectEl.value = cur;
  };

  fillSelect(els.colorFilterTop, colorList, "All");
  fillSelect(els.categoryDropdown, typeList, "All");
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

function matchesFilters(p){
  if(state.color && p.color !== state.color) return false;
  if(state.type && p.type !== state.type) return false;
  return true;
}

/* Render products */
function renderProducts(){
  if(!els.productGrid) return;

  const filtered = PRODUCTS.filter(matchesFilters);
  const sorted = applySort(filtered);

  if(els.resultsCount) els.resultsCount.textContent = String(sorted.length);

  els.productGrid.innerHTML = "";
  if(els.emptyState) els.emptyState.hidden = sorted.length !== 0;

  sorted.forEach(p=>els.productGrid.appendChild(productCard(p)));
}

function productCard(p){
  const wrap = document.createElement("article");
  wrap.className = "product";
  wrap.classList.add(toTypeClass(p.type));

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

    const sorted = [...variants].sort((a,b)=>{
      const na=Number(a.size), nb=Number(b.size);
      if(!Number.isNaN(na) && !Number.isNaN(nb)) return na-nb;
      return String(a.size).localeCompare(String(b.size));
    });

    sorted.forEach(v=>{
      const opt = document.createElement("option");
      opt.value=String(v.size);
      opt.textContent=String(v.size);
      select.appendChild(opt);
    });

    select.addEventListener("change", ()=>{
      const found = sorted.find(v=>String(v.size)===select.value);
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

/* Drawer open/close */
function openDrawer(){ els.drawer?.setAttribute("aria-hidden","false"); }
function closeDrawer(){ els.drawer?.setAttribute("aria-hidden","true"); }

/* Modal */
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
      const sorted = [...variants].sort((a,b)=>Number(a.size)-Number(b.size));
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

/* Bind cart */
function bindCart(){
  els.openCart?.addEventListener("click", ()=>{ renderOrderPanel(); openDrawer(); });
  els.openCartPreview?.addEventListener("click", ()=>{ renderOrderPanel(); openDrawer(); });

  els.closeDrawer?.addEventListener("click", closeDrawer);
  els.drawerBackdrop?.addEventListener("click", closeDrawer);

  els.clearCart?.addEventListener("click", ()=>{ setCheckoutStep("cart"); setCart([]); });

  if (els.tillNumberUI) els.tillNumberUI.textContent = CONFIG.tillNumberPlaceholder;

  togglePaymentUI();

  els.copyTillBtn?.addEventListener("click", ()=>copyToClipboard(CONFIG.tillNumberPlaceholder));
  els.copyAmountBtn?.addEventListener("click", ()=>copyToClipboard(String(calcSubtotal())));

  (els.payRadios||[]).forEach(r=>{
    r.addEventListener("change", ()=>{ togglePaymentUI(); setCheckoutStep("cart"); });
  });

  els.checkoutBtn?.addEventListener("click", (e)=>{
    e.preventDefault();

    const cart = getCart();
    if(!cart.length){ toast("No items in cart."); return; }

    const method = getPayMethod();

    if(method.toLowerCase().includes("cash")){
      const phone = cleanPhone(els.customerPhone?.value);
      if(!phone || phone.length < 9){ alert("Please enter a valid phone number."); return; }
      window.open(buildWhatsAppLink(buildCheckoutWhatsAppMessage()), "_blank", "noopener,noreferrer");
      return;
    }

    if(getCheckoutStep()==="cart"){
      setCheckoutStep("checkout");
      toast("Copy Till + Amount, pay, then paste M-Pesa code.");
      els.mpesaCode?.focus?.();
      return;
    }

    const phone = cleanPhone(els.customerPhone?.value);
    if(!phone || phone.length < 9){ alert("Please enter a valid phone number."); return; }

    const mpesaCode = safeText(els.mpesaCode?.value);
    if(!mpesaCode || mpesaCode.length < 6){ alert("Please paste your M-Pesa confirmation code."); return; }

    window.open(buildWhatsAppLink(buildCheckoutWhatsAppMessage()), "_blank", "noopener,noreferrer");
  });
}

/* Load products */
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
      pattern: safeText(p.pattern),
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

/* Bind filters */
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

/* Main */
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
