// Shared building blocks for country files.

/** The particulars almost every VAT/GST system asks for. Countries add their own on top. */
export function vatParticulars(taxIdLabel: string, extra: string[] = []): string[] {
  return [
    'Seller’s name and address',
    `Seller’s ${taxIdLabel} (if registered)`,
    'Buyer’s name and address',
    'Unique, sequential invoice number',
    'Invoice date (and supply date if different)',
    'Description, quantity and unit price of each item',
    'Tax rate and tax amount for each rate charged',
    'Total amount payable',
    ...extra,
  ];
}

export const PWC = (country: string) => ({
  label: `PwC Worldwide Tax Summaries: ${country}`,
  url: `https://taxsummaries.pwc.com/${country.toLowerCase().replace(/[^a-z]+/g, '-')}/corporate/other-taxes`,
});
