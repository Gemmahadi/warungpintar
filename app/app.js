/* WarungPintar — logika kasir, suara, bon, ringkasan. Tanpa dependensi. */
(function () {
  "use strict";

  var LS_KEY = "wp_state_v1";
  // Di VPS, nginx mem-proxy /warungpintar/api/ ke backend 127.0.0.1:8901.
  // Lokal (file/http di laptop), backend jalan di port 8901.
  var API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:8901"
    : "/warungpintar/api";

  var DEFAULT_PRODUCTS = [
    { id: "kopi",    name: "Kopi Hitam",       price: 5000,  icon: "☕" },
    { id: "teh",     name: "Teh Manis",        price: 4000,  icon: "🍵" },
    { id: "indogor", name: "Indomie Goreng",   price: 4000,  icon: "🍜" },
    { id: "indokuah",name: "Indomie Kuah",     price: 4000,  icon: "🍲" },
    { id: "aqua",    name: "Aqua 600ml",       price: 4000,  icon: "💧" },
    { id: "susuq",   name: "SusuQ",            price: 6000,  icon: "🥛" },
    { id: "chitato", name: "Chitato",          price: 12000, icon: "🍟" },
    { id: "gas",     name: "Gas LPG 3kg",      price: 19000, icon: "🛢️" },
    { id: "beras",   name: "Beras 1kg",        price: 14000, icon: "🌾" },
    { id: "gula",    name: "Gula 1kg",         price: 18000, icon: "🧂" },
    { id: "minyak",  name: "Minyak Goreng 1L", price: 38000, icon: "🫗" },
    { id: "telur",   name: "Telur 1kg",        price: 28000, icon: "🥚" },
    { id: "rokok",   name: "Rokok Surya",      price: 24000, icon: "🚬" },
    { id: "sabun",   name: "Sabun Mandi",      price: 5000,  icon: "🧼" },
    { id: "mie",     name: "Mie Instan",       price: 3500,  icon: "🍝" },
    { id: "kerupuk", name: "Kerupuk",          price: 2000,  icon: "🍘" },
  ];
  var ICON_CHOICES = ["☕", "🍵", "🍜", "🍲", "💧", "🥛", "🍟", "🛢️", "🌾", "🧂", "🫗", "🥚", "🚬", "🧼", "🍝", "🍘", "🍞", "🥤", "🍪", "🧃"];

  function defaultState() {
    return { products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)), txs: [], payments: [], seq: 1 };
  }

  var state = load();
  var cart = [];            // [{id, name, price, qty}]
  var cartPayment = "tunai";
  var editingPrice = false;
  var aiOnline = false;
  var currentPreview = null; // {items:[{name, price, qty}], customer, payment, source}

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      if (!s.products || !s.txs || !s.payments) return defaultState();
      return s;
    } catch (e) { return defaultState(); }
  }
  function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return "Rp " + Number(n).toLocaleString("id-ID"); }
  function todayKey(ts) { var d = new Date(ts || Date.now()); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function timeStr(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  function productByName(name) {
    for (var i = 0; i < state.products.length; i++) if (state.products[i].name === name) return state.products[i];
    return null;
  }
  function customers() {
    // Utang dihitung dari transaksi bon dikurangi pembayaran — tidak pernah basi.
    var map = {};
    state.txs.forEach(function (tx) {
      if (tx.payment === "bon" && tx.customer) {
        map[tx.customer] = map[tx.customer] || { name: tx.customer, debt: 0, txs: [] };
        map[tx.customer].debt += tx.total;
        map[tx.customer].txs.push(tx);
      }
    });
    state.payments.forEach(function (p) {
      map[p.customer] = map[p.customer] || { name: p.customer, debt: 0, txs: [] };
      map[p.customer].debt -= p.amount;
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  /* ---------- tabs ---------- */
  document.querySelectorAll("nav.bottom button").forEach(function (btn) {
    btn.addEventListener("click", function () { showTab(btn.getAttribute("data-tab")); });
  });
  function showTab(name) {
    document.querySelectorAll("section.tab").forEach(function (s) { s.classList.remove("active"); });
    $("tab-" + name).classList.add("active");
    document.querySelectorAll("nav.bottom button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === name);
    });
    if (name === "bon") renderBon();
    if (name === "ringkasan") renderSummary();
    window.scrollTo(0, 0);
  }

  /* ---------- katalog ---------- */
  function renderProducts() {
    var grid = $("productGrid");
    grid.innerHTML = "";
    state.products.forEach(function (p) {
      var tile = document.createElement("div");
      tile.className = "tile" + (editingPrice ? " editing" : "");
      if (editingPrice) {
        tile.innerHTML = '<span class="ic">' + p.icon + '</span><span class="nm"></span>' +
          '<input class="price-edit" type="number" min="0" step="500" value="' + p.price + '" aria-label="Harga ' + p.name + '">';
        tile.querySelector(".nm").textContent = p.name;
        tile.querySelector("input").addEventListener("change", function (e) {
          var v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= 0) { p.price = v; save(); toast(p.name + " → " + fmt(v)); renderCart(); }
        });
        tile.querySelector("input").addEventListener("click", function (e) { e.stopPropagation(); });
      } else {
        tile.innerHTML = '<span class="ic">' + p.icon + '</span><span class="nm"></span><span class="pr">' + fmt(p.price) + '</span>';
        tile.querySelector(".nm").textContent = p.name;
        tile.addEventListener("click", function () { addToCart(p); });
      }
      grid.appendChild(tile);
    });
  }
  $("editPriceBtn").addEventListener("click", function () {
    editingPrice = !editingPrice;
    this.textContent = editingPrice ? "✓ Selesai ubah harga" : "✎ Ubah harga";
    renderProducts();
  });
  $("addProductBtn").addEventListener("click", function () {
    $("addProductForm").classList.toggle("hidden");
  });
  $("saveProductBtn").addEventListener("click", function () {
    var name = $("newProdName").value.trim();
    var price = parseInt($("newProdPrice").value, 10);
    if (!name) { toast("Isi dulu nama produknya"); return; }
    if (isNaN(price) || price < 0) { toast("Harga tidak valid"); return; }
    if (productByName(name)) { toast("Produk itu sudah ada"); return; }
    state.products.push({ id: "p" + Date.now(), name: name, price: price, icon: ICON_CHOICES[state.products.length % ICON_CHOICES.length] });
    save(); renderProducts();
    $("newProdName").value = ""; $("newProdPrice").value = "";
    $("addProductForm").classList.add("hidden");
    toast(name + " ditambahkan");
  });

  /* ---------- keranjang ---------- */
  function addToCart(p, qty) {
    qty = qty || 1;
    var line = null;
    cart.forEach(function (l) { if (l.id === p.id) line = l; });
    if (line) line.qty += qty; else cart.push({ id: p.id, name: p.name, price: p.price, qty: qty });
    renderCart();
  }
  function cartTotal() { return cart.reduce(function (s, l) { return s + l.price * l.qty; }, 0); }
  function renderCart() {
    var box = $("cartBox");
    if (!cart.length) {
      box.innerHTML = '<p class="cart-empty">Keranjang masih kosong. Ketuk produk di atas, atau pakai suara.</p>';
    } else {
      box.innerHTML = "";
      cart.forEach(function (line, i) {
        var row = document.createElement("div");
        row.className = "cart-line";
        row.innerHTML = '<span class="nm"></span><span class="qty"><button type="button" aria-label="Kurangi">−</button><span>' + line.qty + '</span><button type="button" aria-label="Tambah">+</button></span><span class="amt">' + fmt(line.price * line.qty) + '</span>';
        row.querySelector(".nm").innerHTML = "";
        row.querySelector(".nm").appendChild(document.createTextNode(line.name));
        var sm = document.createElement("small"); sm.textContent = fmt(line.price) + " × " + line.qty; row.querySelector(".nm").appendChild(sm);
        var btns = row.querySelectorAll(".qty button");
        btns[0].addEventListener("click", function () { line.qty--; if (line.qty <= 0) cart.splice(i, 1); renderCart(); });
        btns[1].addEventListener("click", function () { line.qty++; renderCart(); });
        box.appendChild(row);
      });
      var total = document.createElement("div");
      total.className = "total-row";
      total.innerHTML = "<span>Total</span><span>" + fmt(cartTotal()) + "</span>";
      box.appendChild(total);
    }
    // daftar pelanggan untuk autocomplete
    var dl = $("customerList"); dl.innerHTML = "";
    customers().forEach(function (c) {
      var o = document.createElement("option"); o.value = c.name; dl.appendChild(o);
    });
  }
  $("payToggle").querySelectorAll("button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      cartPayment = btn.getAttribute("data-pay");
      $("payToggle").querySelectorAll("button").forEach(function (b) {
        b.classList.remove("sel-tunai", "sel-bon");
      });
      btn.classList.add(cartPayment === "tunai" ? "sel-tunai" : "sel-bon");
      $("custReq").classList.toggle("hidden", cartPayment !== "bon");
    });
  });
  $("clearCartBtn").addEventListener("click", function () { cart = []; renderCart(); });
  $("checkoutBtn").addEventListener("click", function () {
    if (!cart.length) { toast("Keranjang masih kosong"); return; }
    var customer = $("customerInput").value.trim();
    if (cartPayment === "bon" && !customer) { toast("Isi nama pelanggan untuk Bon"); $("customerInput").focus(); return; }
    saveTransaction(cart.map(function (l) { return { name: l.name, price: l.price, qty: l.qty }; }), customer || null, cartPayment);
    cart = []; $("customerInput").value = ""; renderCart(); renderSummary();
    toast("Transaksi tersimpan ✓");
  });

  function saveTransaction(items, customer, payment) {
    var total = items.reduce(function (s, it) { return s + it.price * it.qty; }, 0);
    state.txs.unshift({ id: state.seq++, ts: Date.now(), items: items, total: total, payment: payment, customer: customer });
    save();
  }

  /* ---------- suara + uraian ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, listening = false;
  var micBtn = $("micBtn"), voiceHint = $("voiceHint");
  if (!SR) {
    voiceHint.innerHTML = "Browser ini belum mendukung mikrofon — <b>ketik saja kalimatnya</b> di bawah, tetap bisa diuraikan.";
    micBtn.style.opacity = ".45";
  }
  micBtn.addEventListener("click", function () {
    if (!SR) { toast("Mikrofon tidak didukung browser ini — ketik saja"); $("sayInput").focus(); return; }
    if (listening) { rec.stop(); return; }
    rec = new SR();
    rec.lang = "id-ID"; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      var finalText = "", interim = "";
      for (var i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      var show = (finalText || interim).trim();
      if (show) $("transcript").textContent = show;
      if (finalText.trim()) {
        $("sayInput").value = finalText.trim();
        parseFlow(finalText.trim(), true);
      }
    };
    rec.onerror = function (e) {
      setListening(false);
      voiceHint.innerHTML = "Mikrofon gagal (" + (e.error || "error") + ") — <b>ketik saja kalimatnya</b> di bawah.";
    };
    rec.onend = function () { setListening(false); };
    try { rec.start(); setListening(true); } catch (e) { toast("Mikrofon tidak bisa dimulai"); }
  });
  function setListening(on) {
    listening = on;
    micBtn.classList.toggle("listening", on);
    voiceHint.innerHTML = on ? "<b>Mendengarkan…</b> bicara sekarang, misal “Bu Euis bon SusuQ dua”." : "<b>Ketuk mikrofon</b>, lalu bicara. Atau ketik kalimatnya di bawah ini.";
  }

  async function parseFlow(text, fromVoice) {
    $("transcript").textContent = text;
    var result = null, source = "lokal";
    if (aiOnline) {
      try {
        result = await parseWithAI(text);
        source = "AI (Gemini)";
      } catch (e) { result = null; }
    }
    if (!result) {
      result = WPParser.parseSentence(text, state.products);
      source = aiOnline ? "lokal (AI gagal, fallback)" : "lokal";
    }
    showPreview(result, source);
  }
  function parseWithAI(text) {
    return new Promise(function (resolve, reject) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 8000);
      fetch(API_BASE + "/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, products: state.products.map(function (p) { return p.name; }) }),
        signal: ctrl.signal,
      }).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (j) {
        if (!j || !Array.isArray(j.items)) throw new Error("bad shape");
        resolve(j);
      }).catch(reject);
    });
  }
  $("parseLocalBtn").addEventListener("click", function () {
    var text = $("sayInput").value.trim();
    if (!text) { toast("Ketik dulu kalimatnya"); return; }
    var result = WPParser.parseSentence(text, state.products);
    showPreview(result, "lokal");
  });
  $("parseAiBtn").addEventListener("click", function () {
    var text = $("sayInput").value.trim();
    if (!text) { toast("Ketik dulu kalimatnya"); return; }
    parseFlow(text, false);
  });

  function showPreview(result, source) {
    var box = $("previewBox");
    var items = (result.items || []).map(function (it) {
      var p = productByName(it.product);
      if (!p) return null;
      return { name: p.name, price: p.price, qty: Math.max(1, Math.round(it.qty || 1)) };
    }).filter(Boolean);
    if (!items.length) {
      box.innerHTML = '<div class="preview" style="border-color:var(--gold);background:#FFF7E6"><h4 style="color:var(--gold)">Tidak ada produk yang dikenali</h4><p class="sub" style="margin:0">Coba sebut nama produknya, misal “kopi dua” atau “SusuQ tiga”. Produk yang tersedia ada di katalog di bawah.</p></div>';
      currentPreview = null;
      return;
    }
    currentPreview = { items: items, customer: result.customer || "", payment: result.payment || "tunai", source: source };
    renderPreview();
  }
  function renderPreview() {
    var box = $("previewBox");
    var pv = currentPreview;
    if (!pv) { box.innerHTML = ""; return; }
    var total = pv.items.reduce(function (s, it) { return s + it.price * it.qty; }, 0);
    var html = '<div class="preview"><h4>✓ Hasil uraian — periksa dulu, lalu simpan</h4>';
    pv.items.forEach(function (it, i) {
      html += '<div class="p-line"><span>' + esc(it.name) + ' × ' + it.qty + ' <small>(' + fmt(it.price) + ')</small></span>' +
        '<span><button type="button" class="btn ghost small" data-pv-minus="' + i + '" style="padding:4px 10px;min-height:32px">−</button> ' +
        '<button type="button" class="btn ghost small" data-pv-plus="' + i + '" style="padding:4px 10px;min-height:32px">+</button> ' +
        '<b>' + fmt(it.price * it.qty) + '</b></span></div>';
    });
    html += '<div class="p-line"><span><b>Total</b></span><b>' + fmt(total) + '</b></div>';
    html += '<div class="p-edit"><label style="font-size:13px;font-weight:700">Pelanggan</label>' +
      '<input id="pvCustomer" type="text" list="customerList" value="' + escAttr(pv.customer) + '" placeholder="Nama (wajib kalau Bon)" style="flex:1;min-width:120px">' +
      '<select id="pvPayment"><option value="tunai">💵 Tunai</option><option value="bon">📒 Bon</option></select></div>';
    html += '<div class="btnrow" style="margin-top:10px"><button type="button" class="btn green" id="pvSave">Simpan Transaksi</button>' +
      '<button type="button" class="btn ghost" id="pvCancel">Batal</button></div>';
    html += '<p class="src">Diuraikan oleh: ' + esc(pv.source) + ' · Harga ikut katalog saat ini.</p></div>';
    box.innerHTML = html;
    box.querySelector("#pvPayment").value = pv.payment;
    box.querySelectorAll("[data-pv-minus]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.getAttribute("data-pv-minus");
        pv.items[i].qty--; if (pv.items[i].qty <= 0) pv.items.splice(i, 1);
        if (!pv.items.length) { currentPreview = null; renderPreview(); } else renderPreview();
      });
    });
    box.querySelectorAll("[data-pv-plus]").forEach(function (b) {
      b.addEventListener("click", function () { pv.items[+b.getAttribute("data-pv-plus")].qty++; renderPreview(); });
    });
    box.querySelector("#pvSave").addEventListener("click", function () {
      var cust = box.querySelector("#pvCustomer").value.trim();
      var pay = box.querySelector("#pvPayment").value;
      if (pay === "bon" && !cust) { toast("Isi nama pelanggan untuk Bon"); box.querySelector("#pvCustomer").focus(); return; }
      saveTransaction(pv.items.map(function (it) { return { name: it.name, price: it.price, qty: it.qty }; }), cust || null, pay);
      currentPreview = null; renderPreview(); $("sayInput").value = ""; $("transcript").innerHTML = '<span class="ph">Hasil ucapan / kalimat akan muncul di sini…</span>';
      renderSummary(); toast("Transaksi tersimpan ✓");
    });
    box.querySelector("#pvCancel").addEventListener("click", function () { currentPreview = null; renderPreview(); });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function escAttr(s) { return esc(s).replace(/'/g, "&#39;"); }

  /* ---------- status AI ---------- */
  function checkAI() {
    fetch(API_BASE + "/api/health").then(function (r) {
      if (!r.ok) throw new Error("no");
      return r.json();
    }).then(function () { setAI(true); }).catch(function () { setAI(false); });
  }
  function setAI(on) {
    aiOnline = on;
    $("aiDot").className = "ai-dot " + (on ? "on" : "off");
    $("aiText").textContent = on ? "AI: online" : "AI: offline";
    $("parseAiBtn").disabled = false;
  }
  checkAI();
  setInterval(checkAI, 60000);

  /* ---------- bon ---------- */
  function renderBon() {
    var list = $("debtList");
    var custs = customers().filter(function (c) { return c.debt > 0; });
    var badge = $("bonBadge");
    if (custs.length) { badge.textContent = custs.length; badge.classList.remove("hidden"); }
    else badge.classList.add("hidden");
    if (!custs.length) {
      list.innerHTML = '<p class="cart-empty">Tidak ada bon yang belum lunas. 🎉</p>';
    } else {
      list.innerHTML = "";
      custs.forEach(function (c) {
        var card = document.createElement("div");
        card.className = "debt-card";
        var itemsHtml = c.txs.map(function (tx) {
          return "<li>" + timeStr(tx.ts) + " — " + tx.items.map(function (it) { return it.name + " ×" + it.qty; }).join(", ") + " (" + fmt(tx.total) + ")</li>";
        }).join("");
        card.innerHTML = '<div class="top"><span class="who"></span><span class="amt">' + fmt(c.debt) + '</span></div><ul>' + itemsHtml + '</ul>' +
          '<div class="pay-row"><input type="number" min="0" step="1000" placeholder="Nominal bayar (Rp)" aria-label="Nominal bayar">' +
          '<button type="button" class="btn small">Bayar sebagian</button>' +
          '<button type="button" class="btn green small">Lunas</button></div>';
        card.querySelector(".who").textContent = c.name;
        var input = card.querySelector("input");
        var btns = card.querySelectorAll("button");
        btns[0].addEventListener("click", function () {
          var amt = parseInt(input.value, 10);
          if (isNaN(amt) || amt <= 0) { toast("Isi nominal yang benar"); return; }
          if (amt > c.debt) { toast("Nominal melebihi utang (" + fmt(c.debt) + ")"); return; }
          state.payments.unshift({ id: state.seq++, ts: Date.now(), customer: c.name, amount: amt });
          save(); renderBon(); renderSummary(); toast("Pembayaran " + fmt(amt) + " dicatat ✓");
        });
        btns[1].addEventListener("click", function () {
          state.payments.unshift({ id: state.seq++, ts: Date.now(), customer: c.name, amount: c.debt });
          save(); renderBon(); renderSummary(); toast(c.name + " lunas ✓");
        });
        list.appendChild(card);
      });
    }
    var ph = $("payHistory");
    if (!state.payments.length) ph.innerHTML = '<p class="cart-empty">Belum ada pembayaran bon.</p>';
    else {
      ph.innerHTML = state.payments.slice(0, 10).map(function (p) {
        return '<div class="h-line"><span><span class="tag bayar">BAYAR</span> <b>' + esc(p.customer) + '</b><small>' + timeStr(p.ts) + '</small></span><b>' + fmt(p.amount) + '</b></div>';
      }).join("");
    }
  }

  /* ---------- ringkasan ---------- */
  function renderSummary() {
    var tk = todayKey();
    var today = state.txs.filter(function (tx) { return todayKey(tx.ts) === tk; });
    var revenue = today.reduce(function (s, tx) { return s + tx.total; }, 0);
    var cash = today.filter(function (tx) { return tx.payment === "tunai"; }).reduce(function (s, tx) { return s + tx.total; }, 0);
    var bon = revenue - cash;
    var debt = customers().reduce(function (s, c) { return s + Math.max(0, c.debt); }, 0);
    var counts = {};
    today.forEach(function (tx) { tx.items.forEach(function (it) { counts[it.name] = (counts[it.name] || 0) + it.qty; }); });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    $("todayLabel").textContent = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    $("statRevenue").textContent = fmt(revenue);
    $("statCash").textContent = fmt(cash);
    $("statBon").textContent = fmt(bon);
    $("statCount").textContent = today.length;
    $("statDebt").textContent = fmt(debt);
    $("statTop").textContent = top ? top + " ×" + counts[top] : "—";
    var hist = $("txHistory");
    if (!state.txs.length) hist.innerHTML = '<p class="cart-empty">Belum ada transaksi.</p>';
    else {
      hist.innerHTML = state.txs.slice(0, 15).map(function (tx) {
        var tag = tx.payment === "bon" ? '<span class="tag bon">BON</span>' : '<span class="tag tunai">TUNAI</span>';
        var who = tx.customer ? " — <b>" + esc(tx.customer) + "</b>" : "";
        return '<div class="h-line"><span>' + tag + who + '<small>' + timeStr(tx.ts) + " · " + tx.items.map(function (it) { return it.name + " ×" + it.qty; }).join(", ") + '</small></span><b>' + fmt(tx.total) + "</b></div>";
      }).join("");
    }
  }

  /* ---------- data demo ---------- */
  function seed() {
    var now = Date.now();
    var H = 3600 * 1000;
    function tx(hoursAgo, items, payment, customer) {
      var total = items.reduce(function (s, it) { return s + it.price * it.qty; }, 0);
      return { id: state.seq++, ts: now - hoursAgo * H, items: items, total: total, payment: payment, customer: customer };
    }
    var P = {};
    state.products.forEach(function (p) { P[p.name] = p.price; });
    var sample = [
      tx(0.4, [{ name: "SusuQ", price: P["SusuQ"], qty: 2 }], "bon", "Bu Euis"),
      tx(1.2, [{ name: "Indomie Goreng", price: P["Indomie Goreng"], qty: 3 }, { name: "Teh Manis", price: P["Teh Manis"], qty: 2 }], "tunai", "Pak Darman"),
      tx(2.0, [{ name: "Kopi Hitam", price: P["Kopi Hitam"], qty: 1 }, { name: "Aqua 600ml", price: P["Aqua 600ml"], qty: 2 }], "tunai", "Mas Anton"),
      tx(3.1, [{ name: "Beras 1kg", price: P["Beras 1kg"], qty: 1 }], "tunai", "Bu Euis"),
      tx(4.5, [{ name: "Gas LPG 3kg", price: P["Gas LPG 3kg"], qty: 1 }], "bon", "Mbak Sari"),
      tx(5.2, [{ name: "Telur 1kg", price: P["Telur 1kg"], qty: 1 }], "bon", "Pak Darman"),
      tx(26, [{ name: "Chitato", price: P["Chitato"], qty: 2 }], "tunai", "Mas Anton"),
    ];
    state.txs = sample.concat(state.txs);
    state.payments.unshift({ id: state.seq++, ts: now - 2 * H, customer: "Bu Euis", amount: 5000 });
    save();
  }
  $("seedBtn").addEventListener("click", function () { seed(); renderSummary(); toast("Data contoh diisi ✓"); });
  $("resetBtn").addEventListener("click", function () {
    if (!confirm("Hapus SEMUA transaksi, pembayaran, dan kembalikan harga ke bawaan?")) return;
    state = defaultState(); save(); cart = [];
    renderProducts(); renderCart(); renderBon(); renderSummary();
    toast("Data dihapus");
  });

  /* ---------- init ---------- */
  renderProducts();
  renderCart();
  renderSummary();

  /* Hook demo untuk pengujian screenshot: ?demo=seed|cart|bon|ringkasan */
  var demo = new URLSearchParams(location.search).get("demo");
  if (demo) {
    if (!state.txs.length) seed();
    if (demo === "cart") {
      addToCart(productByName("Kopi Hitam"), 1);
      addToCart(productByName("Aqua 600ml"), 2);
      cartPayment = "tunai";
    }
    if (demo === "bon") showTab("bon");
    if (demo === "ringkasan") showTab("ringkasan");
    if (demo === "seed") renderSummary();
    if (demo === "preview") {
      $("sayInput").value = "Bu Euis bon SusuQ dua";
      $("transcript").textContent = "Bu Euis bon SusuQ dua";
      showPreview(WPParser.parseSentence("Bu Euis bon SusuQ dua", state.products), "lokal");
    }
    if (demo === "flow") {
      // Uji alur klik sungguhan di browser: checkout tunai + lunaskan bon pertama.
      addToCart(productByName("Kopi Hitam"), 1);
      addToCart(productByName("Aqua 600ml"), 2);
      $("checkoutBtn").click();
      showTab("bon");
      var lunasBtn = document.querySelector("#debtList .debt-card .pay-row .btn.green");
      var lunasName = lunasBtn ? lunasBtn.closest(".debt-card").querySelector(".who").textContent : "NONE";
      if (lunasBtn) lunasBtn.click();
      showTab("ringkasan");
      var out = document.createElement("div");
      out.id = "testout";
      out.textContent = "FLOWTEST txs=" + state.txs.length +
        " revenue=" + $("statRevenue").textContent +
        " tunai=" + $("statCash").textContent +
        " bonToday=" + $("statBon").textContent +
        " debt=" + $("statDebt").textContent +
        " lunasName=" + lunasName +
        " bonCustomersLeft=" + customers().filter(function (c) { return c.debt > 0; }).length;
      document.body.appendChild(out);
    }
    renderProducts(); renderCart(); renderBon(); renderSummary();
  }
})();
