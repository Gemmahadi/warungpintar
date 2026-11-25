// Tes unit parser lokal WarungPintar — jalankan: node tests/parser.test.js
const { parseSentence } = require("../app/parser.js");

const PRODUCTS = [
  "Kopi Hitam", "Teh Manis", "Indomie Goreng", "Indomie Kuah", "Aqua 600ml",
  "SusuQ", "Chitato", "Gas LPG 3kg", "Beras 1kg", "Gula 1kg",
  "Minyak Goreng 1L", "Telur 1kg", "Rokok Surya", "Sabun Mandi",
  "Mie Instan", "Kerupuk",
].map((name) => ({ name }));

const CASES = [
  {
    text: "Bu Euis bon SusuQ dua",
    expect: { items: [{ product: "SusuQ", qty: 2 }], customer: "Bu Euis", payment: "bon" },
  },
  {
    text: "tiga indomie goreng tunai",
    expect: { items: [{ product: "Indomie Goreng", qty: 3 }], customer: null, payment: "tunai" },
  },
  {
    text: "Pak Darman bon beras satu kilo",
    expect: { items: [{ product: "Beras 1kg", qty: 1 }], customer: "Pak Darman", payment: "bon" },
  },
  {
    text: "Mas Anton beli kopi dua sama teh manis satu, tunai",
    expect: { items: [{ product: "Kopi Hitam", qty: 2 }, { product: "Teh Manis", qty: 1 }], customer: "Mas Anton", payment: "tunai" },
  },
  {
    text: "Mbak Sari bon gas satu sama gula dua kilo",
    expect: { items: [{ product: "Gas LPG 3kg", qty: 1 }, { product: "Gula 1kg", qty: 2 }], customer: "Mbak Sari", payment: "bon" },
  },
  {
    text: "aqua 5",
    expect: { items: [{ product: "Aqua 600ml", qty: 5 }], customer: null, payment: null },
  },
  {
    text: "Bu Euis bon susu q tiga",
    expect: { items: [{ product: "SusuQ", qty: 3 }], customer: "Bu Euis", payment: "bon" },
  },
  {
    text: "telur dua kilo tunai",
    expect: { items: [{ product: "Telur 1kg", qty: 2 }], customer: null, payment: "tunai" },
  },
  {
    text: "Pak Darman bon indomie kuah empat sama kerupuk dua",
    expect: { items: [{ product: "Indomie Kuah", qty: 4 }, { product: "Kerupuk", qty: 2 }], customer: "Pak Darman", payment: "bon" },
  },
  {
    text: "beli chitato satu, rokok surya satu, bayar tunai",
    expect: { items: [{ product: "Chitato", qty: 1 }, { product: "Rokok Surya", qty: 1 }], customer: null, payment: "tunai" },
  },
  {
    text: "minyak goreng satu liter sama sabun dua, bon ya Bu Euis",
    expect: { items: [{ product: "Minyak Goreng 1L", qty: 1 }, { product: "Sabun Mandi", qty: 2 }], customer: "Bu Euis", payment: "bon" },
  },
  {
    text: "kopi",
    expect: { items: [{ product: "Kopi Hitam", qty: 1 }], customer: null, payment: null },
  },
];

function sameItems(a, b) {
  if (a.length !== b.length) return false;
  const key = (x) => x.product + "|" + x.qty;
  return a.map(key).sort().join(",") === b.map(key).sort().join(",");
}

let pass = 0;
CASES.forEach((c, i) => {
  const got = parseSentence(c.text, PRODUCTS);
  const ok =
    sameItems(got.items, c.expect.items) &&
    got.customer === c.expect.customer &&
    got.payment === c.expect.payment;
  if (ok) pass++;
  console.log(
    `${ok ? "PASS" : "FAIL"} #${i + 1}: "${c.text}"\n` +
    `     got: ${JSON.stringify(got)}\n` +
    (ok ? "" : `     want: ${JSON.stringify(c.expect)}\n`)
  );
});
console.log(`\n${pass}/${CASES.length} lolos`);
process.exit(pass === CASES.length ? 0 : 1);
