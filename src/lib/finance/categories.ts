/** Fixed category catalogue. Keys are stored on transactions; colours stay consistent app-wide. */
export type CategoryTone = "coral" | "saffron" | "turquoise" | "violet" | "pink" | "plum";

export interface Category {
  key: string;
  label: string;
  tone: CategoryTone;
  icon: string; // lucide icon name, resolved in the UI layer
  kind: "expense" | "income";
}

export const EXPENSE_CATEGORIES: Category[] = [
  { key: "food", label: "Food & Dining", tone: "coral", icon: "UtensilsCrossed", kind: "expense" },
  { key: "groceries", label: "Groceries", tone: "turquoise", icon: "ShoppingBasket", kind: "expense" },
  { key: "shopping", label: "Shopping", tone: "saffron", icon: "ShoppingBag", kind: "expense" },
  { key: "transport", label: "Transportation", tone: "turquoise", icon: "Bus", kind: "expense" },
  { key: "housing", label: "Housing & Rent", tone: "violet", icon: "Home", kind: "expense" },
  { key: "utilities", label: "Utilities & Bills", tone: "saffron", icon: "Zap", kind: "expense" },
  { key: "entertainment", label: "Entertainment", tone: "pink", icon: "Clapperboard", kind: "expense" },
  { key: "healthcare", label: "Healthcare", tone: "coral", icon: "HeartPulse", kind: "expense" },
  { key: "education", label: "Education", tone: "violet", icon: "GraduationCap", kind: "expense" },
  { key: "subscriptions", label: "Subscriptions", tone: "pink", icon: "Repeat", kind: "expense" },
  { key: "personal_care", label: "Personal Care", tone: "pink", icon: "Sparkles", kind: "expense" },
  { key: "household", label: "Household Supplies", tone: "turquoise", icon: "SprayCan", kind: "expense" },
  { key: "other", label: "Other", tone: "plum", icon: "CircleEllipsis", kind: "expense" },
];

export const INCOME_CATEGORIES: Category[] = [
  { key: "salary", label: "Salary", tone: "turquoise", icon: "Briefcase", kind: "income" },
  { key: "freelance", label: "Freelance", tone: "violet", icon: "Laptop", kind: "income" },
  { key: "interest", label: "Interest", tone: "saffron", icon: "Percent", kind: "income" },
  { key: "gift", label: "Gifts", tone: "pink", icon: "Gift", kind: "income" },
  { key: "other_income", label: "Other income", tone: "plum", icon: "CircleEllipsis", kind: "income" },
];

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
const BY_KEY = new Map(ALL.map((c) => [c.key, c]));

export function getCategory(key: string | null | undefined): Category {
  return (key && BY_KEY.get(key)) || { key: "uncategorised", label: "Uncategorised", tone: "plum", icon: "CircleDashed", kind: "expense" };
}

export const PAYMENT_METHODS = ["UPI", "Cash", "Debit card", "Credit card", "Bank transfer", "IMPS", "NEFT", "RTGS", "Net banking", "Other"] as const;
