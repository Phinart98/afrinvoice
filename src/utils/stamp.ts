// Wording for the "rules checked" stamp. Countries store lastVerified as 'YYYY-MM'.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function checkedMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** The oldest to the newest check, e.g. "September to October 2026". */
export function checkedSpan(list: string[]): string {
  const sorted = [...list].sort();
  const first = sorted[0], last = sorted[sorted.length - 1];
  if (first === last) return checkedMonth(first);
  if (first.slice(0, 4) === last.slice(0, 4)) return `${MONTHS[Number(first.slice(5)) - 1]} to ${checkedMonth(last)}`;
  return `${checkedMonth(first)} to ${checkedMonth(last)}`;
}
