# Afrinvoice — Research Sources

Data accuracy is the moat. Every country config in `countryConfigs.ts` is derived from the sources below.
Cross-check these URLs to verify tax rates, VAT labels, and mobile money providers before launch.

---

## Ghana

**Tax:**
- Ghana Revenue Authority (official): https://gra.gov.gh
- GRA VAT rate (15%): https://gra.gov.gh/vat/
- PwC Ghana Tax Summary 2024: https://taxsummaries.pwc.com/ghana

**Mobile Money:**
- MTN MoMo Ghana: https://www.mtn.com.gh/momo/
- Telecel Cash (formerly Vodafone Cash — rebranded 2024): https://telecelghana.com/cash
- AirtelTigo Money: https://www.airteltigo.com.gh/services/mobile-money/
- Bank of Ghana FinTech Report 2024: https://www.bog.gov.gh
- Fonoa Ghana e-VAT 2026 guide: https://www.fonoa.com/blog/ghana-e-invoicing

**Key finding:** Vodafone Ghana rebranded to Telecel Ghana in 2024.

---

## Nigeria

**Tax:**
- Nigeria Revenue Service (NRS, formerly FIRS): https://www.nrs.gov.ng / https://www.firs.gov.ng
- VAT 7.5% confirmed (raised from 5% in Feb 2020): https://www.firs.gov.ng/vat-act
- PwC Nigeria Tax Summary: https://taxsummaries.pwc.com/nigeria

**Mobile Money / Payments:**
- OPay: https://opayweb.com
- PalmPay: https://palmpay.com
- MTN MoMo PSB Nigeria: https://momodeveloper.mtn.com
- Duplo fintech blog (Nigeria B2B payments): https://tryduplo.com

**Key finding:** Nigeria B2B invoices use bank transfer as primary. OPay/PalmPay are consumer P2P.

---

## Kenya

**Tax:**
- Kenya Revenue Authority: https://www.kra.go.ke
- KRA VAT 16%: https://www.kra.go.ke/en/individual/tax-rates/vat
- PwC Kenya Tax Summary: https://taxsummaries.pwc.com/kenya

**Mobile Money:**
- Safaricom M-Pesa (34M+ users, $300B+/yr): https://www.safaricom.co.ke/personal/m-pesa
- Airtel Money Kenya: https://www.airtel.co.ke/airtel-money
- GSMA Mobile Money Metrics: https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/mobile-money/

---

## South Africa

**Tax:**
- SARS: https://www.sars.gov.za
- SARS VAT 15%: https://www.sars.gov.za/types-of-tax/value-added-tax/
- PwC South Africa: https://taxsummaries.pwc.com/south-africa

**Payments:**
- MTN MoMo SA: https://www.mtn.co.za/mtn-mobile-money/
- PayShap (interbank instant payments, 2023): https://www.payshap.co.za

**Key finding:** South Africa B2B runs on EFT bank transfer. Mobile money penetration is much lower than other African markets.

---

## Zimbabwe

**Tax:**
- ZIMRA: https://www.zimra.co.zw
- ZIMRA VAT 15%: https://www.zimra.co.zw/tax-types/value-added-tax
- Note: Zimbabwe uses ZWG (Zimbabwe Gold, April 2024) — replaced ZWL

**Mobile Money:**
- EcoCash (Econet Wireless): https://www.econet.co.zw/ecocash (~95% share)
- OneMoney (NetOne): https://www.netone.co.zw/onemoney/
- Finmark Trust Zimbabwe FinScope Survey: https://finmark.org.za

**Key finding:** EcoCash dominates Zimbabwe. MTN MoMo has no meaningful presence — do not list it.

---

## Tanzania

**Tax:**
- TRA: https://www.tra.go.tz
- VAT 18%: https://www.tra.go.tz/index.php/vat

**Mobile Money:**
- Tigo Pesa / Yas (Tanzania #1): https://www.yas.co.tz
- M-Pesa Tanzania (Vodacom TZ, #2): https://www.vodacom.co.tz/mpesa
- Airtel Money Tanzania: https://www.airtel.co.tz

**Key finding:** Tigo Pesa (now "Yas") is #1 in Tanzania. M-Pesa is #2. Opposite to Kenya.

---

## Reference: Payment Systems Outside Africa
*(Not in countryConfigs.ts — Africa-only tool — but useful context when building payment field UI and understanding format differences)*

**India — UPI:**
- NPCI UPI: https://www.npci.org.in/what-we-do/upi
- UPI account format is `name@bankname` (e.g., `rahul@sbi`) — NOT a phone number
- PhonePe / Google Pay / Paytm all use the same UPI rails
- GST India: https://www.gst.gov.in — 18% standard services rate

**Southeast Asia — Digital Wallets:**
- Vietnam has a company called "MoMo" (M_Service, momo.vn) — ZERO relation to MTN MoMo Africa. If Vietnam added in future, label carefully.
- GCash (Philippines): phone number format `+639XXXXXXXXX`
- bKash (Bangladesh): `01XXXXXXXXX` — USSD `*247#`

**Key insight for select box UI:** The "account number" field label and placeholder must adapt per payment method — not all mobile money is a phone number, not all bank fields need SWIFT.

---

## West Africa CFA Zone (Cameroon, Côte d'Ivoire, Senegal)

**Tax:**
- Cameroon DGI: https://www.impots.cm — TVA 19.25%
- Côte d'Ivoire DGI: https://www.dgi.gouv.ci — TVA 18%
- Senegal DGI: https://www.impotsetdomaines.gouv.sn — TVA 18%

**Mobile Money:**
- Orange Money (dominant Francophone West Africa): https://www.orange.com/en/products-and-services/orange-money
- Wave (fast-growing challenger in Senegal/Côte d'Ivoire): https://www.wave.com
- MTN MoMo Cameroon: https://www.mtn.cm/momo/

**Key finding:** Wave is disrupting Orange Money in Senegal with near-zero fees.

---

## General / Multi-Country

- GSMA Mobile Money Metrics (global): https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/mobile-money/
- PwC Worldwide Tax Summaries: https://taxsummaries.pwc.com
- World Bank Financial Inclusion Database: https://globalfindex.worldbank.org
- Finmark Trust (Southern Africa): https://finmark.org.za

---

*Last verified: March 2026. VAT rates and provider details change — use the "Something wrong? Tell us →" Tally form to submit corrections.*
