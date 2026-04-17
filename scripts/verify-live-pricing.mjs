const url = process.env.LATTICE_VERIFY_URL ?? "http://127.0.0.1:3000/api/prices";

const holdings = [
  { holdingId: "ethi", kind: "etf", symbol: "ETHI", market: "ASX" },
  { holdingId: "hack", kind: "etf", symbol: "HACK", market: "ASX" },
  { holdingId: "asia", kind: "etf", symbol: "ASIA", market: "ASX" },
  { holdingId: "btc", kind: "crypto", symbol: "BTC" },
  { holdingId: "eth", kind: "crypto", symbol: "ETH" },
];

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ holdings }),
});

const payload = await response.json();

if (!response.ok) {
  console.error("Pricing verification failed:", payload);
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));
