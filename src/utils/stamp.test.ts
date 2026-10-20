import { describe, expect, it } from 'vitest';
import { checkedMonth, checkedSpan } from './stamp';

describe('checkedMonth', () => {
  it('spells out a YYYY-MM month', () => {
    expect(checkedMonth('2026-09')).toBe('September 2026');
    expect(checkedMonth('2027-01')).toBe('January 2027');
  });
});

describe('checkedSpan', () => {
  it('gives one month when every country was checked the same month', () => {
    expect(checkedSpan(['2026-09', '2026-09'])).toBe('September 2026');
  });
  it('gives a range within one year without repeating the year', () => {
    expect(checkedSpan(['2026-10', '2026-09', '2026-10'])).toBe('September to October 2026');
  });
  it('gives a range across years in full', () => {
    expect(checkedSpan(['2027-01', '2026-12'])).toBe('December 2026 to January 2027');
  });
});
