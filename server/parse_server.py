#!/usr/bin/env python3
"""WarungPintar AI parse backend — Python stdlib only.

POST /api/parse  {text, products?} -> Gemini gemini-2.5-flash returns ONLY JSON
                    {items:[{product, qty}], customer, payment}
GET  /api/health -> {"ok": true}

The Gemini API key comes ONLY from the GEMINI_API_KEY environment variable.
It is never hardcoded, never printed, never written to disk by this server.
Run:  GEMINI_API_KEY=... python3 parse_server.py   (PORT env, default 8901)
"""
import json
import os
import re
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    + GEMINI_MODEL
    + ":generateContent"
)
TIMEOUT_S = 20

DEFAULT_PRODUCTS = [
    "Kopi Hitam", "Teh Manis", "Indomie Goreng", "Indomie Kuah", "Aqua 600ml",
    "SusuQ", "Chitato", "Gas LPG 3kg", "Beras 1kg", "Gula 1kg",
    "Minyak Goreng 1L", "Telur 1kg", "Rokok Surya", "Sabun Mandi",
    "Mie Instan", "Kerupuk",
]


def build_prompt(text, products):
    names = ", ".join(products)
    return (
        "Kamu adalah parser kasir warung Indonesia. Ubah kalimat pelanggan menjadi JSON SAJA, "
        "tanpa teks lain, tanpa markdown, tanpa penjelasan.\n"
        "Katalog produk (pakai nama persis dari katalog ini, jangan bikin nama baru): "
        + names + ".\n"
        "Format JSON: {\"items\": [{\"product\": \"<nama katalog>\", \"qty\": <angka>}], "
        "\"customer\": \"<nama pelanggan atau null>\", \"payment\": \"bon\" | \"tunai\" | null}\n"
        "Aturan:\n"
        "- qty dari angka atau kata bilangan Indonesia (satu=1, dua=2, tiga=3, empat=4, lima=5, "
        "enam=6, tujuh=7, delapan=8, sembilan=9, sepuluh=10, sebelas=11, dua belas=12, "
        "setengah=0.5). Kalau tidak disebut jumlah, qty=1.\n"
        "- Cocokkan produk secara longgar: 'susu q', 'susuq', 'susu' -> SusuQ; 'indomie goreng' -> "
        "Indomie Goreng; 'aqua' -> Aqua 600ml; 'gas'/'elpiji' -> Gas LPG 3kg; 'beras' -> Beras 1kg; "
        "'gula' -> Gula 1kg; 'minyak' -> Minyak Goreng 1L; 'telur'/'telor' -> Telur 1kg; "
        "'kopi' -> Kopi Hitam; 'teh' -> Teh Manis; 'chitato'/'chiki' -> Chitato; 'rokok' -> Rokok Surya; "
        "'sabun' -> Sabun Mandi; 'mie'/'mi instan' -> Mie Instan; 'kerupuk' -> Kerupuk.\n"
        "- customer: nama orang yang disebut (misal 'Bu Euis', 'Pak Darman', 'Mas Anton'). "
        "Kalau tidak ada nama, null.\n"
        "- payment: 'bon' kalau ada kata bon/utang/ngutang/catat/dicatat; 'tunai' kalau ada kata "
        "tunai/cash/bayar langsung/lunas; kalau tidak jelas, null.\n"
        "- Abaikan kata yang bukan produk/jumlah/nama/pembayaran.\n"
        "Kalimat: " + text
    )


def call_gemini(api_key, prompt):
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 512},
    }).encode("utf-8")
    req = urllib.request.Request(
        GEMINI_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


def extract_json(raw_text):
    """Pull the JSON object out of a model reply (strip ``` fences if present)."""
    t = raw_text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    start = t.find("{")
    end = t.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in model reply")
    return json.loads(t[start:end + 1])


def validate(parsed, products):
    """Coerce model output into the strict shape the frontend expects."""
    if not isinstance(parsed, dict):
        raise ValueError("model reply is not an object")
    items = []
    for it in parsed.get("items") or []:
        if not isinstance(it, dict):
            continue
        name = it.get("product")
        if name not in products:
            continue
        try:
            qty = float(it.get("qty", 1))
        except (TypeError, ValueError):
            qty = 1
        if qty <= 0:
            continue
        items.append({"product": name, "qty": int(qty) if qty == int(qty) else qty})
    customer = parsed.get("customer")
    if customer is not None and not isinstance(customer, str):
        customer = None
    if isinstance(customer, str):
        customer = customer.strip() or None
    payment = parsed.get("payment")
    if payment not in ("bon", "tunai"):
        payment = None
    return {"items": items, "customer": customer, "payment": payment}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # keep logs quiet; never log bodies/keys
        pass

    def _send(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/health":
            self._send(200, {"ok": True})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/parse":
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send(400, {"error": "bad Content-Length"})
            return
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._send(400, {"error": "invalid JSON body"})
            return
        text = (body.get("text") or "").strip()
        if not text:
            self._send(400, {"error": "text is empty"})
            return
        products = body.get("products") or DEFAULT_PRODUCTS
        if not isinstance(products, list) or not products:
            products = DEFAULT_PRODUCTS
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            self._send(502, {"error": "server has no GEMINI_API_KEY configured"})
            return
        try:
            resp = call_gemini(api_key, build_prompt(text, products))
            parts = resp.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            raw = "".join(p.get("text", "") for p in parts)
            if not raw.strip():
                raise ValueError("empty model reply")
            parsed = validate(extract_json(raw), products)
            self._send(200, parsed)
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode("utf-8")[:300]
            except Exception:
                detail = ""
            self._send(502, {"error": "gemini http %s %s" % (e.code, detail)})
        except Exception as e:
            self._send(502, {"error": str(e)[:200]})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8901"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("WarungPintar parse server on 127.0.0.1:%d (model %s)" % (port, GEMINI_MODEL))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
