/**
 * WarungPintar — parser kalimat kasir (lokal, tanpa AI).
 * Dipakai browser (app.js) dan Node (tes unit).
 * parseSentence(text, products) -> { items:[{product, qty}], customer, payment }
 * products: [{name}] — nama katalog persis.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.WPParser = factory();
})(typeof self !== "undefined" ? self : this, function () {

  var NUMBER_WORDS = {
    "satu": 1, "dua": 2, "tiga": 3, "empat": 4, "lima": 5, "enam": 6,
    "tujuh": 7, "delapan": 8, "sembilan": 9, "sepuluh": 10,
    "sebelas": 11, "dua belas": 12, "duabelas": 12, "setengah": 0.5
  };
  var UNIT_WORDS = ["kilo", "kg", "bungkus", "pcs", "botol", "gelas", "biji", "pack", "liter", "ltr", "ons", "lembar", "sachet", "kaleng", "dus"];

  // alias -> nama katalog (dicek dari yang terpanjang dulu)
  var ALIASES = [
    ["indomie goreng", "Indomie Goreng"], ["indomie kuah", "Indomie Kuah"],
    ["indomie rebus", "Indomie Kuah"], ["mie goreng", "Indomie Goreng"],
    ["mi goreng", "Indomie Goreng"], ["indomie", "Indomie Goreng"],
    ["mie kuah", "Indomie Kuah"], ["mi kuah", "Indomie Kuah"],
    ["minyak goreng", "Minyak Goreng 1L"], ["minyak", "Minyak Goreng 1L"],
    ["gas lpg", "Gas LPG 3kg"], ["elpiji", "Gas LPG 3kg"], ["gas", "Gas LPG 3kg"],
    ["lpg", "Gas LPG 3kg"],
    ["aqua", "Aqua 600ml"], ["air mineral", "Aqua 600ml"], ["air", "Aqua 600ml"],
    ["susu q", "SusuQ"], ["susuq", "SusuQ"], ["susu", "SusuQ"],
    ["chitato", "Chitato"], ["chiki", "Chitato"], ["ciki", "Chitato"],
    ["keripik", "Chitato"],
    ["beras", "Beras 1kg"], ["gula", "Gula 1kg"],
    ["telur", "Telur 1kg"], ["telor", "Telur 1kg"],
    ["kopi hitam", "Kopi Hitam"], ["kopi", "Kopi Hitam"],
    ["teh manis", "Teh Manis"], ["teh", "Teh Manis"],
    ["rokok surya", "Rokok Surya"], ["rokok", "Rokok Surya"], ["surya", "Rokok Surya"],
    ["sabun mandi", "Sabun Mandi"], ["sabun", "Sabun Mandi"],
    ["mie instan", "Mie Instan"], ["mi instan", "Mie Instan"],
    ["kerupuk", "Kerupuk"], ["krupuk", "Kerupuk"]
  ];

  function normalize(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[.,!?;:()"]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function titleCase(s) {
    return s.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function tokenQty(tok) {
    if (!tok) return null;
    if (/^\d+([.,]\d+)?$/.test(tok)) return parseFloat(tok.replace(",", "."));
    if (NUMBER_WORDS.hasOwnProperty(tok)) return NUMBER_WORDS[tok];
    // "sebiji", "sebungkus", "sekilo", "sebotol" -> 1
    if (/^se(biji|bungkus|kilo|botol|gelas|pack|pcs|kaleng|sachet|lembar)$/.test(tok)) return 1;
    return null;
  }

  function parseSentence(text, products) {
    var norm = normalize(text);
    var tokens = norm ? norm.split(" ") : [];
    var catalog = {};
    (products || []).forEach(function (p) { catalog[p.name] = true; });

    // ---- customer: "Bu Euis", "Pak Darman", "Mas Anton", dst.
    // Nama = 1 kata setelah sapaan; kata ke-2 hanya diambil kalau bukan kata kunci
    // (bon/beli/tunai/nama produk/dll) supaya "Bu Euis bon" tidak jadi "Bu Euis Bon".
    var NAME_STOP = ["bon", "beli", "tunai", "bayar", "sama", "dan", "mau", "minta",
      "ambil", "kasih", "tolong", "ya", "dong", "satu", "dua", "tiga", "empat", "lima",
      "enam", "tujuh", "delapan", "sembilan", "sepuluh", "kilo", "kg", "bungkus", "botol",
      "kopi", "teh", "indomie", "mie", "mi", "aqua", "susu", "chitato", "chiki", "ciki",
      "gas", "beras", "gula", "minyak", "telur", "telor", "rokok", "sabun", "kerupuk",
      "air", "elpiji", "lpg", "keripik", "satu", "cash", "lunas", "utang", "ngutang",
      "catat", "dicatat", "catet"];
    var customer = null;
    var m = norm.match(/\b(bu|pak|mas|mbak|bang|tante|om|kak|bude|pakde)\s+([a-z]+)/);
    if (m) {
      var honor = { "bu": "Bu", "pak": "Pak", "mas": "Mas", "mbak": "Mbak", "bang": "Bang", "tante": "Tante", "om": "Om", "kak": "Kak", "bude": "Bude", "pakde": "Pakde" }[m[1]];
      var name = titleCase(m[2]);
      var rest = norm.slice(m.index + m[0].length).trim().split(" ")[0];
      if (rest && NAME_STOP.indexOf(rest) < 0 && !NUMBER_WORDS.hasOwnProperty(rest) && !/^\d+$/.test(rest)) {
        name += " " + titleCase(rest);
      }
      customer = honor + " " + name;
    }

    // ---- payment
    var payment = null;
    if (/\b(bon|utang|ngutang|catat|dicatat|catet|catet dulu|nanti bayar|bayar nanti)\b/.test(norm)) payment = "bon";
    else if (/\b(tunai|cash|bayar langsung|bayar kontan|lunas)\b/.test(norm)) payment = "tunai";

    // ---- items: cari alias di teks, lalu jumlah di sekitarnya
    var found = {}; // product -> qty
    var usedSpans = [];
    ALIASES.forEach(function (pair) {
      var alias = pair[0], product = pair[1];
      if (!catalog[product]) return;
      var start = 0;
      while (true) {
        var idx = norm.indexOf(alias, start);
        if (idx < 0) break;
        var end = idx + alias.length;
        var before = idx === 0 || norm[idx - 1] === " ";
        var after = end >= norm.length || norm[end] === " ";
        if (before && after) {
          // jangan dobel-hitung span yang sudah dipakai alias lebih panjang
          var overlap = usedSpans.some(function (s) { return idx < s[1] && end > s[0]; });
          if (!overlap) {
            usedSpans.push([idx, end]);
            var qty = qtyAround(tokens, norm, idx, end);
            found[product] = (found[product] || 0) + qty;
          }
        }
        start = end;
      }
    });

    var items = Object.keys(found).map(function (name) {
      return { product: name, qty: found[name] };
    });
    return { items: items, customer: customer, payment: payment };
  }

  function qtyAround(tokens, norm, idx, end) {
    // posisi token dari offset karakter
    var beforeText = norm.slice(0, idx).trim();
    var afterText = norm.slice(end).trim();
    var beforeToks = beforeText ? beforeText.split(" ") : [];
    var afterToks = afterText ? afterText.split(" ") : [];

    // angka sesudah produk: "susuq dua", "beras 2"
    if (afterToks.length) {
      var q = tokenQty(afterToks[0]);
      if (q !== null) return q;
    }
    // angka sebelum produk, langsung atau lewat satuan: "dua indomie", "satu kilo beras"
    for (var i = beforeToks.length - 1; i >= Math.max(0, beforeToks.length - 3); i--) {
      var tok = beforeToks[i];
      var q2 = tokenQty(tok);
      if (q2 !== null) return q2;
      if (UNIT_WORDS.indexOf(tok) < 0) break; // berhenti kalau bukan angka/satuan
    }
    return 1;
  }

  return { parseSentence: parseSentence, NUMBER_WORDS: NUMBER_WORDS };
});
