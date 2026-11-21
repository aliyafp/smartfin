/** Category suggestions for scanned documents and their items. Pure. */
import { suggestCategory } from "@/lib/import/statement";
import type { DocumentType } from "./types";

export interface CategoryRule { pattern: string; match_field: "merchant" | "item"; category: string }
export interface CategorySuggestion { category: string | null; confidence: "high" | "medium" | "low"; source: "your_rule" | "merchant" | "items" | "document_type" | null }

const DOC_TYPE_CATEGORY: Partial<Record<DocumentType, string>> = {
  restaurant_receipt: "food",
  grocery_receipt: "groceries",
  utility_bill: "utilities",
  subscription_payment: "subscriptions",
};

const ITEM_RULES: [RegExp, string][] = [
  [/\b(rice|atta|wheat|flour|dal|daal|toor|moong|chana|rajma|milk|curd|dahi|paneer|butter|ghee|bread|pav|eggs?|sugar|salt|oil|tea|coffee|biscuits?|vegetables?|veg|fruits?|onions?|potato(es)?|tomato(es)?|banana|apple|masala|spices?|maggi|noodles|poha|besan|jaggery|namkeen|chips|juice)\b/i, "groceries"],
  [/\b(soap|detergent|surf|ariel|tide|vim|harpic|lizol|dettol|phenyl|cleaner|tissue|toilet\s*paper|garbage\s*bags?|broom|mop|dishwash|scrubber|colin|odonil|mosquito|good\s*knight|all\s*out)\b/i, "household"],
  [/\b(shampoo|conditioner|toothpaste|toothbrush|face\s*wash|cream|lotion|deo|deodorant|perfume|razor|sanitary|pads|lipstick|cosmetics?|hair\s*oil)\b/i, "personal_care"],
  [/\b(tablets?|tab\.?|capsules?|cap\.?|syrup|medicine|paracetamol|dolo|crocin|ointment|bandage|injection|strip)\b/i, "healthcare"],
  [/\b(pizza|burger|biryani|thali|dosa|idli|paratha|naan|roti|paneer\s*tikka|noodles\s*bowl|sandwich|meal|combo|fries|coke|pepsi|lassi|ice\s*cream|starter|curry)\b/i, "food"],
  [/\b(petrol|diesel|fuel|cng)\b/i, "transport"],
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function matchRule(text: string, rules: CategoryRule[], field: "merchant" | "item"): string | null {
  const t = norm(text);
  if (!t) return null;
  // Longest pattern wins, so "amazon fresh" beats "amazon".
  const hits = rules.filter((r) => r.match_field === field && t.includes(norm(r.pattern))).sort((a, b) => b.pattern.length - a.pattern.length);
  return hits[0]?.category ?? null;
}

/** Items on a restaurant / food-delivery bill are food, whatever the dish is called. */
const ITEM_DOC_DEFAULT: Partial<Record<DocumentType, string>> = { restaurant_receipt: "food" };

export function suggestItemCategory(name: string, rules: CategoryRule[] = [], documentType?: DocumentType): CategorySuggestion {
  const ruled = matchRule(name, rules, "item");
  if (ruled) return { category: ruled, confidence: "high", source: "your_rule" };
  const byDoc = documentType ? ITEM_DOC_DEFAULT[documentType] : undefined;
  if (byDoc) return { category: byDoc, confidence: "medium", source: "document_type" };
  for (const [re, c] of ITEM_RULES) if (re.test(name)) return { category: c, confidence: "medium", source: "items" };
  return { category: null, confidence: "low", source: null };
}

/**
 * Parent-transaction category:
 * 1. your saved rules  2. known merchant  3. what most item value falls under  4. document type.
 * Income uses income categories only; transfers have none.
 */
export function suggestScanCategory(input: {
  merchant: string | null; description: string | null; documentType: DocumentType; txnType: "expense" | "income" | "refund" | "transfer" | null;
  items: { name: string; lineTotalPaise: number | null }[];
}, rules: CategoryRule[] = []): CategorySuggestion {
  if (input.txnType === "transfer") return { category: null, confidence: "high", source: null };
  const merchantText = `${input.merchant ?? ""} ${input.description ?? ""}`.trim();
  const ruled = matchRule(merchantText, rules, "merchant");
  if (ruled) return { category: ruled, confidence: "high", source: "your_rule" };
  const kind = input.txnType === "income" ? "income" : "expense";
  const byMerchant = merchantText ? suggestCategory(merchantText, kind) : null;
  if (byMerchant) return { category: byMerchant, confidence: "high", source: "merchant" };
  if (kind === "income") return { category: null, confidence: "low", source: null };

  const weights = new Map<string, number>();
  for (const it of input.items) {
    const s = suggestItemCategory(it.name, rules, input.documentType);
    if (s.category) weights.set(s.category, (weights.get(s.category) ?? 0) + (it.lineTotalPaise ?? 1));
  }
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const top = [...weights.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && total > 0) {
    // Groceries + household essentials on one bill is still a grocery run.
    const cat = top[0] === "household" && (weights.get("groceries") ?? 0) > 0 ? "groceries" : top[0];
    return { category: cat, confidence: top[1] / total >= 0.6 ? "medium" : "low", source: "items" };
  }
  const byDoc = DOC_TYPE_CATEGORY[input.documentType];
  if (byDoc) return { category: byDoc, confidence: "medium", source: "document_type" };
  return { category: null, confidence: "low", source: null };
}
