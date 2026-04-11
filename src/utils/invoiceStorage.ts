// Persisted business details — never store client/invoice data here

export interface StoredBusiness {
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  businessLogo: string; // base64 PNG/JPG from FileReader
  // Bank payment
  bankName: string;
  accountNumber: string;
  accountName: string;
  swiftCode: string;
  // Mobile money payment
  momoProvider: string;
  momoNumber: string;
  momoName: string;
  // Auto-increment counter for invoice numbers
  invoiceCounter: number;
}

const STORAGE_KEY = 'afrinvoice_business';

export function loadBusiness(): Partial<StoredBusiness> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<StoredBusiness>;
  } catch {
    return {};
  }
}

export function saveBusiness(data: Partial<StoredBusiness>): void {
  try {
    const existing = loadBusiness();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...data }));
  } catch {
    // Silently ignore — private browsing or quota exceeded
  }
}

export function nextInvoiceNumber(prefix = 'INV'): string {
  const stored = loadBusiness();
  const counter = (stored.invoiceCounter ?? 0) + 1;
  saveBusiness({ invoiceCounter: counter });
  return `${prefix}-${String(counter).padStart(4, '0')}`;
}
