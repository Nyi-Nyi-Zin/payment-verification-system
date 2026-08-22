# Provider Sample Analysis — AYA Pay and KBZPay

**Analysis version:** 1.0.0

**Raw sample policy:** The supplied screenshots, PDF, and Excel files contain personal and transaction data. They are used for analysis only and are not copied into the Git repository.

## 1. AYA Pay Screenshot Findings

Both AYA Pay screenshots use the same E-Receipt layout and expose the following fields:

| Screenshot field | Canonical field | Notes |
|---|---|---|
| Transaction Type | `transaction_type` | The supplied samples show `Transfer to Wallet`. Keep as raw value because other AYA transaction types may exist. |
| Transaction Code | `external_transaction_id` | Numeric identifier; sample values are 12 digits. Store as string, not integer. |
| Transaction Status | `transaction_status` | Sample value is `done`; only successful statuses should be eligible for auto-verification. |
| Date and Time | `transaction_at_local` | Display format is `d MMMM yyyy, h:mm a`, e.g. `9 August 2026, 2:12 PM`. Normalize with `Asia/Yangon`. |
| Sender Name | `sender_name` | Required for direction and optional name comparison. |
| Sender Phone | `sender_phone` | Useful for direction/account matching; store normalized and masked display separately if needed. |
| Receiver Name | `receiver_name` | Required for direction and optional name comparison. |
| Receiver Phone | `receiver_phone` | Useful for direction/account matching. |
| Amount | `amount` | Numeric value followed by `MMK`; parse as decimal. |
| Total | `total_amount` | Sample equals Amount; retain raw value and validate equality before trusting it. |
| Notes | `reference` or `notes` | Free text; should not be used as a required matching key. |

The two supplied samples demonstrate two directions. In the first sample, the account holder `NYI NYI ZIN` is the sender and `THA TOE AUNG` is the receiver, so it is an outgoing transfer from the account holder. In the second sample, `KHIN SANDAR WIN` is the sender and `NYI NYI ZIN` is the receiver, so it is an incoming transfer to the account holder.

Therefore the AYA OCR model must not only extract names and phone numbers; it must also derive a normalized direction:

| Direction | Rule |
|---|---|
| `INCOMING` | The configured wallet/account identity matches receiver name or receiver phone. |
| `OUTGOING` | The configured wallet/account identity matches sender name or sender phone. |
| `UNKNOWN` | The account identity is not configured, fields are unreadable, or both sides are ambiguous. |

For the current payment-verification use case, the default auto-verification candidate should normally be `INCOMING`, because the system is expected to verify customer payments received by the business wallet. Outgoing transfers should remain visible but should not be auto-verified unless the business rule explicitly allows them. The backend now stores this policy in a provider-specific `BusinessWalletConfig` record with `accountName`, optional `phoneNumber`, and `allowOutgoingAutoVerify`.

## 2. KBZPay PDF Findings

The supplied KBZPay PDF is a multi-page statement containing account metadata followed by a transaction table. The visible transaction columns are:

| PDF column | Canonical field |
|---|---|
| Transaction Date & Time | `transaction_at_local` |
| Tm_Ref_No | `external_transaction_id` |
| Detailed Description | `description` / `reference` |
| Credit | `credit_amount` |
| Debit | `debit_amount` |
| Balance | `running_balance` |

The PDF statement also contains account holder name, phone number, NRC/passport number, account type, and time period. These are statement metadata rather than transaction-level fields.

The PDF is suitable as a human-readable audit/reference document, but it should not be the primary production import format because it is a multi-page visual table, descriptions wrap onto multiple lines, and the `Notes` column is not present in the supplied PDF view. PDF parsing can be added as a fallback or manual-review import path if required.

## 3. KBZPay Excel Findings

The supplied Excel workbook is the preferred import source for this project.

| Finding | Detail |
|---|---|
| Workbook sheets | `Sheet1` contains the statement; `Sheet2` and `Sheet3` are empty in the supplied file. |
| Metadata rows | Rows 1–5 contain account holder, phone, NRC/passport, account type, and time period. |
| Header row | Row 6 contains the transaction headers. |
| Opening balance | Row 7 is an opening-balance row and must not be imported as a payment transaction. |
| Transaction rows | Transactions begin at row 8. |
| Columns | Transaction Date & Time, Tm_Ref_No, Detailed Description, Notes, Credit, Debit, Balance. |
| Date format | `dd-MM-yyyy HH:mm:ss`, e.g. `23-05-2026 20:59:18`. |
| Identifier | `Tm_Ref_No` is a long numeric-looking identifier and must be stored as a string. |
| Amount format | Comma-formatted decimals such as `20,000.00`, `0.00`, and `-0.00`. |
| Direction | Positive Credit indicates incoming funds; negative Debit indicates outgoing funds. |
| Description | P2P transfer descriptions may wrap or contain masked phone numbers. |
| Notes | Free-text notes are available in Excel and should map to `reference`/`notes`. |

The canonical KBZPay transaction amount should be derived as follows:

```text
if Credit > 0 and Debit is zero: direction = INCOMING; amount = Credit
if Debit < 0 and Credit is zero: direction = OUTGOING; amount = abs(Debit)
if both are non-zero or both are zero: direction = UNKNOWN; send to review
```

`Balance` should be retained for reconciliation and audit, but it should not be required for screenshot matching.

## 4. Recommended Project Input Format

The project should support the following provider-specific input model:

| Provider | Primary input | Secondary/reference input | Processing method |
|---|---|---|---|
| AYA Pay | Actual wallet history export, preferably Excel/CSV if available | Screenshot E-Receipt | Structured parser for export; OCR extractor for screenshot |
| KBZPay | Excel statement | PDF statement | Excel parser for production; PDF parser only as fallback/reference |
| WavePay | Actual wallet history export, preferably Excel/CSV if available | Screenshot | To be defined after samples arrive |

The system should not require the client to convert every file into a generic format manually. Instead, each provider adapter should accept its native export and normalize it to the shared transaction model.

## 5. Required Canonical Fields

The current schema should be extended or mapped to include the fields below:

```text
provider
external_transaction_id
transaction_status
direction
amount
currency
transaction_at_local
transaction_at_utc
business_date
sender_name
sender_phone
receiver_name
receiver_phone
reference
credit_amount       # provider raw value where available
debit_amount        # provider raw value where available
running_balance     # provider raw value where available
source_import_id
raw_row_json
```

The screenshot OCR model should include the same identity/direction fields where the provider exposes them. For KBZPay, the Excel `Credit`/`Debit` columns provide the authoritative direction. For AYA Pay, direction is derived by the backend direction classifier from the configured wallet name/phone compared with the OCR-extracted sender/receiver fields. A match on both sides or no match on either side returns `UNKNOWN`; it is not eligible for automatic verification.

## 6. Business Wallet Configuration Required Per Provider

Before automatic verification is enabled, configure one business wallet identity per provider:

```text
provider: KBZPAY | AYAPAY | WAVEPAY
accountName: exact wallet/account display name
phoneNumber: wallet phone number, if available
allowOutgoingAutoVerify: false by default
```

The name is normalized with Unicode normalization, case normalization, and punctuation/space removal. Phone numbers are normalized to a comparable Myanmar format, including conversion of `+959...` to `09...`. The classifier uses exact normalized name or phone equality; it does not use loose substring matching. If both sender and receiver match, or neither matches, direction is `UNKNOWN` and the case goes to review.

## 7. What Is Still Needed

The AYA Pay screenshots are sufficient to begin the AYA OCR field contract, but an actual AYA Pay wallet history export is still needed to implement the matching side reliably. The following samples remain required:

1. AYA Pay incoming transaction export/history sample.
2. AYA Pay outgoing transaction export/history sample, if outgoing records will be retained.
3. KBZPay confirmation of whether Excel is the regular operational export format and whether the PDF should be supported as an import fallback.
4. WavePay screenshot and wallet history export samples.
5. Confirmation of the business wallet identity for each provider: account name, phone number, or another stable identifier used to derive incoming/outgoing direction.
6. Confirmation that only successful incoming transactions should be eligible for automatic verification.

## 8. Recommendation

Use **KBZPay Excel as the primary import format** for the supplied statement. Keep the PDF as a reference/audit attachment and defer PDF parsing unless the client regularly provides PDF only. Use the AYA screenshots as OCR fixtures, but do not finalize AYA matching until the corresponding AYA export/history format and business-wallet identity are supplied.
