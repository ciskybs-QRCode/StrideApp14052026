// Maps org country + currency → bank transfer UI config

export interface BankConfig {
  type: "iban" | "bsb" | "sort_code" | "routing" | "swift";
  label: string;
  accountLabel: string;
  accountPlaceholder: string;
  bicLabel?: string;
  refLabel: string;
  currency: string;
  currencySymbol: string;
}

const EU = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR",
  "HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK",
  "SI","ES","SE","IS","NO","LI",
]);

const SYMBOLS: Record<string, string> = {
  EUR:"€", USD:"$", GBP:"£", AUD:"A$", NZD:"NZ$", CAD:"C$",
  CHF:"CHF", JPY:"¥", KZT:"₸", MXN:"MX$", BRL:"R$", INR:"₹",
  RUB:"₽", CNY:"¥", HKD:"HK$", SGD:"S$", ZAR:"R", TRY:"₺",
  NOK:"kr", SEK:"kr", DKK:"kr", PLN:"zł", HUF:"Ft", CZK:"Kč",
  RON:"lei", BGN:"лв", HRK:"kn", AED:"AED", QAR:"QAR", SAR:"SAR",
  UAH:"₴", GEL:"₾", AMD:"֏", AZN:"₼", UZS:"so'm", THB:"฿",
  IDR:"Rp", MYR:"RM", PHP:"₱", VND:"₫", KRW:"₩", TWD:"NT$",
};

export function currencySymbol(code: string): string {
  return SYMBOLS[(code ?? "EUR").toUpperCase()] ?? (code ?? "EUR").toUpperCase();
}

export function formatAmount(cents: number, currency: string): string {
  const sym = currencySymbol(currency);
  const val = (cents / 100).toFixed(2);
  const before = ["€","£","CHF","$","A$","NZ$","C$","HK$","S$","MX$"].includes(sym);
  return before ? `${sym}${val}` : `${val} ${sym}`;
}

export function getBankConfig(country: string, orgCurrency: string): BankConfig {
  const c = (country ?? "").toUpperCase();
  const cur = (orgCurrency ?? "EUR").toUpperCase();
  const sym = currencySymbol(cur);

  if (c === "AU") return {
    type: "bsb",
    label: "Bank Transfer (BSB)",
    accountLabel: "BSB + Account Number",
    accountPlaceholder: "123-456  123456789",
    refLabel: "Transaction Reference",
    currency: cur !== "EUR" ? cur : "AUD",
    currencySymbol: cur !== "EUR" ? currencySymbol(cur) : "A$",
  };

  if (c === "NZ") return {
    type: "bsb",
    label: "Bank Transfer",
    accountLabel: "Bank-Branch-Account",
    accountPlaceholder: "01-0001-0123456-00",
    refLabel: "Reference",
    currency: cur !== "EUR" ? cur : "NZD",
    currencySymbol: cur !== "EUR" ? currencySymbol(cur) : "NZ$",
  };

  if (c === "GB") return {
    type: "sort_code",
    label: "Bank Transfer",
    accountLabel: "Sort Code + Account Number",
    accountPlaceholder: "12-34-56  12345678",
    refLabel: "Payment Reference",
    currency: cur !== "EUR" ? cur : "GBP",
    currencySymbol: cur !== "EUR" ? currencySymbol(cur) : "£",
  };

  if (c === "US") return {
    type: "routing",
    label: "Wire Transfer",
    accountLabel: "Routing + Account Number",
    accountPlaceholder: "021000021  123456789",
    refLabel: "Reference",
    currency: cur !== "EUR" ? cur : "USD",
    currencySymbol: cur !== "EUR" ? currencySymbol(cur) : "$",
  };

  if (c === "CA") return {
    type: "routing",
    label: "EFT Transfer",
    accountLabel: "Transit + Account Number",
    accountPlaceholder: "00102-123  1234567",
    refLabel: "Reference",
    currency: cur !== "EUR" ? cur : "CAD",
    currencySymbol: cur !== "EUR" ? currencySymbol(cur) : "C$",
  };

  if (c === "CH") return {
    type: "iban",
    label: "Bank Transfer",
    accountLabel: "IBAN (Swiss)",
    accountPlaceholder: "CH56 0483 5012 3456 7800 9",
    bicLabel: "BIC/SWIFT (optional)",
    refLabel: "Payment Reference",
    currency: cur !== "EUR" ? cur : "CHF",
    currencySymbol: cur !== "EUR" ? currencySymbol(cur) : "CHF",
  };

  if (c === "JP") return {
    type: "swift",
    label: "Bank Transfer",
    accountLabel: "Bank + Branch + Account",
    accountPlaceholder: "Bank code + branch + account number",
    refLabel: "Payment Note",
    currency: cur !== "EUR" ? cur : "JPY",
    currencySymbol: cur !== "EUR" ? currencySymbol(cur) : "¥",
  };

  if (c === "KZ") return {
    type: "swift",
    label: "Bank Transfer",
    accountLabel: "BIN + Account (IIK)",
    accountPlaceholder: "SWIFT BIC + account number",
    refLabel: "Payment Reference",
    currency: cur !== "EUR" ? cur : "KZT",
    currencySymbol: cur !== "EUR" ? currencySymbol(cur) : "₸",
  };

  if (EU.has(c)) return {
    type: "iban",
    label: "SEPA Bank Transfer",
    accountLabel: "IBAN",
    accountPlaceholder: c === "IT" ? "IT60 X054 2811 1010 0000 0123 456"
                       : c === "DE" ? "DE89 3704 0044 0532 0130 00"
                       : c === "FR" ? "FR76 3000 6000 0112 3456 7890 189"
                       : c === "ES" ? "ES91 2100 0418 4502 0005 1332"
                       : "XX00 0000 0000 0000 0000 0000 000",
    bicLabel: "BIC (optional)",
    refLabel: "CRO / Reference",
    currency: cur,
    currencySymbol: sym,
  };

  // International fallback
  return {
    type: "swift",
    label: "Bank Transfer",
    accountLabel: "SWIFT/BIC + Account Number",
    accountPlaceholder: "XXXXXXXX + account",
    refLabel: "Transaction Reference",
    currency: cur,
    currencySymbol: sym,
  };
}
