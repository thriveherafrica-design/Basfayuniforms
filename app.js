function productCard(p) {
  const wrap = document.createElement("article");
  wrap.className = "product";

  // ✅ type classes for category-specific styling
  const typeSlug = normalize(p.type || "item");
  wrap.classList.add(`type-${typeSlug}`);

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

  const sizeWrap = document.createElement("div");

  // ✅ smart size sort (numbers first, then S/M/L etc)
  const sizeRank = (s) => {
    const t = String(s).trim().toUpperCase();
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    const map = { XS: 1001, S: 1002, M: 1003, L: 1004, XL: 1005, XXL: 1006 };
    return map[t] ?? 9999;
  };

  if (variants.length) {
    const select = document.createElement("select");
    select.className = "size-select";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select size";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    const sorted = [...variants].sort((a, b) => sizeRank(a.size) - sizeRank(b.size));

    sorted.forEach(v => {
      const opt = document.createElement("option");
      opt.value = String(v.size);
      opt.textContent = String(v.size);
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const found = sorted.find(v => String(v.size) === select.value);
      if (!found) return;
      selected = { size: String(found.size), price: Number(found.price) };
      price.textContent = formatMoney(selected.price);
    });

    sizeWrap.appendChild(select);
    price.textContent = ""; // until size chosen
  } else {
    price.textContent = (p.price != null) ? formatMoney(p.price) : "";
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
        return;
      }
      addToCart(p.id, selected.size, selected.price, 1);
    } else {
      if (p.price == null) {
        alert("Price on request. Please message us on WhatsApp.");
        return;
      }
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
