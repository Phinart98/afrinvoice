// Labels printed ON the invoice (preview + PDF). The website UI stays English;
// only the document a client receives is translated.

export type LabelLang = 'en' | 'fr' | 'de' | 'es' | 'pt' | 'it' | 'nl';

export const LABEL_LANGS: { code: LabelLang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
];

export type DocType = 'invoice' | 'tax-invoice' | 'quote' | 'proforma' | 'receipt' | 'credit-note';

export interface Labels {
  docTitle: Record<DocType, string>;
  number: string; date: string; due: string; validUntil: string; paidOn: string; reference: string;
  from: string; billTo: string; taxId: string;
  description: string; qty: string; unitPrice: string; amount: string;
  subtotal: string; discount: string; shipping: string; total: string;
  /** Taxable base after discount/shipping, excl. tax — printed only when it differs from the subtotal. */
  net: string;
  amountPaid: string; balanceDue: string; pricesIncludeTax: string; ofWhichTax: string;
  paymentDetails: string; bank: string; accountName: string; accountNumber: string;
  iban: string; bic: string; provider: string; mobileNumber: string; upiId: string;
  payOnline: string; scanToPay: string; notes: string;
  /** What the client still has to pay: the hero figure on Band and Studio, a cell on Accounts. */
  amountDue: string;
  /** Swiss's row label for the number, dates and reference. */
  details: string;
  /** Under the Pro signature block. */
  signature: string;
  /** The Pro status stamp. */
  paid: string; draft: string;
}

const en: Labels = {
  docTitle: { invoice: 'INVOICE', 'tax-invoice': 'TAX INVOICE', quote: 'QUOTE', proforma: 'PROFORMA INVOICE', receipt: 'RECEIPT', 'credit-note': 'CREDIT NOTE' },
  number: 'No.', date: 'Date', due: 'Due', validUntil: 'Valid until', paidOn: 'Paid on', reference: 'Reference',
  from: 'From', billTo: 'Bill to', taxId: 'Tax ID',
  description: 'Description', qty: 'Qty', unitPrice: 'Unit price', amount: 'Amount',
  subtotal: 'Subtotal', discount: 'Discount', shipping: 'Shipping', net: 'Net amount (excl. tax)', total: 'Total',
  amountPaid: 'Amount paid', balanceDue: 'Balance due', pricesIncludeTax: 'Prices include tax', ofWhichTax: 'incl.',
  paymentDetails: 'Payment details', bank: 'Bank', accountName: 'Account name', accountNumber: 'Account number',
  iban: 'IBAN', bic: 'BIC / SWIFT', provider: 'Provider', mobileNumber: 'Number', upiId: 'UPI ID',
  payOnline: 'Pay online', scanToPay: 'Scan to pay', notes: 'Notes',
  amountDue: 'Amount due', signature: 'Authorised signature', paid: 'Paid', draft: 'Draft', details: 'Details',
};

const fr: Labels = {
  docTitle: { invoice: 'FACTURE', 'tax-invoice': 'FACTURE', quote: 'DEVIS', proforma: 'FACTURE PRO FORMA', receipt: 'REÇU', 'credit-note': 'AVOIR' },
  number: 'N°', date: 'Date', due: 'Échéance', validUntil: 'Valable jusqu’au', paidOn: 'Payé le', reference: 'Référence',
  from: 'De', billTo: 'Facturer à', taxId: 'N° TVA',
  description: 'Désignation', qty: 'Qté', unitPrice: 'Prix unitaire', amount: 'Montant',
  subtotal: 'Sous-total', discount: 'Remise', net: 'Total HT', shipping: 'Livraison', total: 'Total TTC',
  amountPaid: 'Déjà payé', balanceDue: 'Reste à payer', pricesIncludeTax: 'Prix TTC', ofWhichTax: 'dont',
  paymentDetails: 'Coordonnées de paiement', bank: 'Banque', accountName: 'Titulaire', accountNumber: 'N° de compte',
  iban: 'IBAN', bic: 'BIC', provider: 'Opérateur', mobileNumber: 'Numéro', upiId: 'UPI ID',
  payOnline: 'Payer en ligne', scanToPay: 'Scanner pour payer', notes: 'Notes',
  amountDue: 'Montant dû', signature: 'Signature autorisée', paid: 'Payé', draft: 'Brouillon', details: 'Détails',
};

const de: Labels = {
  docTitle: { invoice: 'RECHNUNG', 'tax-invoice': 'RECHNUNG', quote: 'ANGEBOT', proforma: 'PROFORMARECHNUNG', receipt: 'QUITTUNG', 'credit-note': 'GUTSCHRIFT' },
  number: 'Nr.', date: 'Datum', due: 'Fällig', validUntil: 'Gültig bis', paidOn: 'Bezahlt am', reference: 'Referenz',
  from: 'Von', billTo: 'Rechnung an', taxId: 'USt-IdNr.',
  description: 'Beschreibung', qty: 'Menge', unitPrice: 'Einzelpreis', amount: 'Betrag',
  subtotal: 'Zwischensumme', discount: 'Rabatt', net: 'Nettobetrag', shipping: 'Versand', total: 'Gesamtbetrag',
  amountPaid: 'Bereits bezahlt', balanceDue: 'Offener Betrag', pricesIncludeTax: 'Preise inkl. USt.', ofWhichTax: 'enthalten',
  paymentDetails: 'Bankverbindung', bank: 'Bank', accountName: 'Kontoinhaber', accountNumber: 'Kontonummer',
  iban: 'IBAN', bic: 'BIC', provider: 'Anbieter', mobileNumber: 'Nummer', upiId: 'UPI ID',
  payOnline: 'Online bezahlen', scanToPay: 'Zum Bezahlen scannen', notes: 'Hinweise',
  amountDue: 'Fälliger Betrag', signature: 'Unterschrift', paid: 'Bezahlt', draft: 'Entwurf', details: 'Angaben',
};

const es: Labels = {
  docTitle: { invoice: 'FACTURA', 'tax-invoice': 'FACTURA', quote: 'PRESUPUESTO', proforma: 'FACTURA PROFORMA', receipt: 'RECIBO', 'credit-note': 'FACTURA RECTIFICATIVA' },
  number: 'N.º', date: 'Fecha', due: 'Vencimiento', validUntil: 'Válido hasta', paidOn: 'Pagado el', reference: 'Referencia',
  from: 'De', billTo: 'Facturar a', taxId: 'NIF',
  description: 'Concepto', qty: 'Cant.', unitPrice: 'Precio unitario', amount: 'Importe',
  subtotal: 'Subtotal', discount: 'Descuento', net: 'Base imponible', shipping: 'Envío', total: 'Total',
  amountPaid: 'Pagado', balanceDue: 'Pendiente', pricesIncludeTax: 'Precios con IVA incluido', ofWhichTax: 'incl.',
  paymentDetails: 'Datos de pago', bank: 'Banco', accountName: 'Titular', accountNumber: 'N.º de cuenta',
  iban: 'IBAN', bic: 'BIC', provider: 'Proveedor', mobileNumber: 'Número', upiId: 'UPI ID',
  payOnline: 'Pagar en línea', scanToPay: 'Escanear para pagar', notes: 'Notas',
  amountDue: 'Importe a pagar', signature: 'Firma autorizada', paid: 'Pagado', draft: 'Borrador', details: 'Detalles',
};

const pt: Labels = {
  docTitle: { invoice: 'FATURA', 'tax-invoice': 'FATURA', quote: 'ORÇAMENTO', proforma: 'FATURA PRÓ-FORMA', receipt: 'RECIBO', 'credit-note': 'NOTA DE CRÉDITO' },
  number: 'N.º', date: 'Data', due: 'Vencimento', validUntil: 'Válido até', paidOn: 'Pago em', reference: 'Referência',
  from: 'De', billTo: 'Faturar a', taxId: 'NIF',
  description: 'Descrição', qty: 'Qtd.', unitPrice: 'Preço unitário', amount: 'Valor',
  subtotal: 'Subtotal', discount: 'Desconto', net: 'Base tributável', shipping: 'Envio', total: 'Total',
  amountPaid: 'Valor pago', balanceDue: 'Saldo em dívida', pricesIncludeTax: 'Preços com imposto incluído', ofWhichTax: 'incl.',
  paymentDetails: 'Dados de pagamento', bank: 'Banco', accountName: 'Titular', accountNumber: 'N.º da conta',
  iban: 'IBAN', bic: 'BIC', provider: 'Operador', mobileNumber: 'Número', upiId: 'UPI ID',
  payOnline: 'Pagar online', scanToPay: 'Digitalize para pagar', notes: 'Notas',
  amountDue: 'Valor a pagar', signature: 'Assinatura autorizada', paid: 'Pago', draft: 'Rascunho', details: 'Detalhes',
};

const it: Labels = {
  docTitle: { invoice: 'FATTURA', 'tax-invoice': 'FATTURA', quote: 'PREVENTIVO', proforma: 'FATTURA PROFORMA', receipt: 'RICEVUTA', 'credit-note': 'NOTA DI CREDITO' },
  number: 'N.', date: 'Data', due: 'Scadenza', validUntil: 'Valido fino al', paidOn: 'Pagato il', reference: 'Riferimento',
  from: 'Da', billTo: 'Intestata a', taxId: 'P. IVA',
  description: 'Descrizione', qty: 'Q.tà', unitPrice: 'Prezzo unitario', amount: 'Importo',
  subtotal: 'Subtotale', discount: 'Sconto', net: 'Imponibile', shipping: 'Spedizione', total: 'Totale',
  amountPaid: 'Già pagato', balanceDue: 'Netto a pagare', pricesIncludeTax: 'Prezzi IVA inclusa', ofWhichTax: 'di cui',
  paymentDetails: 'Coordinate di pagamento', bank: 'Banca', accountName: 'Intestatario', accountNumber: 'N. conto',
  iban: 'IBAN', bic: 'BIC', provider: 'Operatore', mobileNumber: 'Numero', upiId: 'UPI ID',
  payOnline: 'Paga online', scanToPay: 'Scansiona per pagare', notes: 'Note',
  amountDue: 'Importo dovuto', signature: 'Firma autorizzata', paid: 'Pagato', draft: 'Bozza', details: 'Dettagli',
};

const nl: Labels = {
  docTitle: { invoice: 'FACTUUR', 'tax-invoice': 'FACTUUR', quote: 'OFFERTE', proforma: 'PROFORMAFACTUUR', receipt: 'KWITANTIE', 'credit-note': 'CREDITNOTA' },
  number: 'Nr.', date: 'Datum', due: 'Vervaldatum', validUntil: 'Geldig tot', paidOn: 'Betaald op', reference: 'Referentie',
  from: 'Van', billTo: 'Factuur aan', taxId: 'Btw-nr.',
  description: 'Omschrijving', qty: 'Aantal', unitPrice: 'Prijs per stuk', amount: 'Bedrag',
  subtotal: 'Subtotaal', discount: 'Korting', net: 'Totaal excl. btw', shipping: 'Verzending', total: 'Totaal',
  amountPaid: 'Reeds betaald', balanceDue: 'Te betalen', pricesIncludeTax: 'Prijzen incl. btw', ofWhichTax: 'waarvan',
  paymentDetails: 'Betaalgegevens', bank: 'Bank', accountName: 'Rekeninghouder', accountNumber: 'Rekeningnummer',
  iban: 'IBAN', bic: 'BIC', provider: 'Aanbieder', mobileNumber: 'Nummer', upiId: 'UPI ID',
  payOnline: 'Online betalen', scanToPay: 'Scan om te betalen', notes: 'Opmerkingen',
  amountDue: 'Te betalen', signature: 'Handtekening', paid: 'Betaald', draft: 'Concept', details: 'Gegevens',
};

export const LABELS: Record<LabelLang, Labels> = { en, fr, de, es, pt, it, nl };
