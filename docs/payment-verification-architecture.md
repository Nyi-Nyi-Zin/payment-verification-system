# Payment Verification System — Consolidated Architecture

**Version:** 1.0.0

**Providers:** KBZPay, AYA Pay, WavePay

**Document owner:** Manus AI

---

## 1. Scope and Operating Model

ဤစနစ်သည် customer များက KBZPay, AYA Pay သို့မဟုတ် WavePay ဖြင့် ငွေလွှဲပြီး Telegram bot မှတစ်ဆင့် payment screenshot ပေးပို့သည့်အခြေအနေတွင် admin များအတွက် **on-demand သို့မဟုတ် scheduled batch payment verification** ပြုလုပ်ပေးမည့်စနစ် ဖြစ်သည်။ Screenshot များကို နေ့စဉ်ဆက်တိုက် စုဆောင်းထားပြီး၊ provider wallet history export ရရှိသည့်အချိန်တွင် admin က နေ့ဘက်ဖြစ်စေ ညဘက်ဖြစ်စေ verification run ကို manually စတင်နိုင်သည်။ ထို့အပြင် configured schedule အတိုင်း automatic run ပြုလုပ်နိုင်သည်။ Run တိုင်းတွင် OCR, matching, duplicate detection နှင့် manual review တို့ကို ဆောင်ရွက်မည်။

> **Core principle:** ဤ MVP သည် provider export ရရှိသည့်အချိန်နှင့် operational need အပေါ် မူတည်၍ နေ့ဘက်/ညဘက် မည်သည့်အချိန်တွင်မဆို manual on-demand run ပြုလုပ်နိုင်ပြီး၊ လိုအပ်ပါက scheduler ဖြင့် automatic run လည်း ပြုလုပ်နိုင်သော batch verification စနစ် ဖြစ်သည်။ Real-time provider API verification မပါဝင်သေးပါ။

စနစ်၏ အဓိကရလဒ်များမှာ `VERIFIED`, `DUPLICATE`, `UNMATCHED`, `PENDING_REVIEW` နှင့် `FAILED` ဟူသော resolution များဖြစ်သည်။ Auto-verification သည် confidence မြင့်သော match များတွင်သာ ခွင့်ပြုမည်ဖြစ်ပြီး၊ ambiguity ရှိသော case များကို manual review သို့ ပို့မည်။

### 1.1 Assumptions and Non-Goals

| အကြောင်းအရာ | MVP ဆုံးဖြတ်ချက် |
|---|---|
| Verification mode | On-demand batch + scheduled batch; real-time provider API verification မပါ |
| Input channel | Telegram bot ဖြင့် payment screenshot လက်ခံခြင်း |
| Wallet history | Admin က provider တစ်ခုချင်းစီ၏ export file ကို upload ပြုလုပ်ခြင်း |
| Provider scope | KBZPay, AYA Pay, WavePay သုံးခု |
| Currency | MVP တွင် MMK ကို default ထားသော်လည်း schema တွင် currency field ပါရှိရမည် |
| Admin client | Flutter mobile application |
| Queue | MVP တွင် Redis/BullMQ မပါ; worker concurrency ကို database lock ဖြင့်ထိန်းချုပ်မည် |
| Real-time integrations | Provider API integration မပါ; export-file based verification သာ |

---

## 2. Provider Abstraction

Provider သုံးခုစလုံး၏ export column names, date/time formats, transaction identifier format, amount representation နှင့် screenshot layout မတူညီနိုင်သည်။ ထို့ကြောင့် system core သည် provider-neutral ဖြစ်ပြီး၊ parsing နှင့် OCR extraction သည် provider-specific adapter များဖြင့် ခွဲထားရမည်။

Canonical provider enum ကို system တစ်ခုလုံးတွင် တစ်မျိုးတည်း အသုံးပြုရမည်။ Display name နှင့် internal code မရောထွေးစေရန် database တွင် `KBZPAY`, `AYAPAY`, `WAVEPAY` ကိုသုံးမည်။ “Wave Money”, “WavePay” နှင့် “Wave” ကဲ့သို့သော label များကို UI display alias အဖြစ်သာ သတ်မှတ်မည်။

| Provider code | Display name | Implementation adapter |
|---|---|---|
| `KBZPAY` | KBZPay | `KbzpayParser`, `KbzpayOcrExtractor` |
| `AYAPAY` | AYA Pay | `AyapayParser`, `AyapayOcrExtractor` |
| `WAVEPAY` | WavePay | `WavepayParser`, `WavepayOcrExtractor` |

Provider detection သည် screenshot ထဲရှိ branding keyword တစ်ခုတည်းကို အားကိုးမထားရ။ Telegram submission တွင် customer/admin မှ provider ကို ရွေးချယ်ပေးနိုင်ပါက `submitted_provider` အဖြစ်သိမ်းပြီး OCR result နှင့် cross-check ပြုလုပ်ရမည်။ Branding မတွေ့ခြင်း၊ OCR confidence နိမ့်ခြင်း သို့မဟုတ် submitted provider နှင့် မကိုက်ခြင်းတို့ကို `PENDING_REVIEW` သို့ ပို့ရမည်။

---

## 3. End-to-End Flow

### 3.1 Phase A — Daytime Screenshot Collection

1. Customer သည် KBZPay, AYA Pay သို့မဟုတ် WavePay မှတစ်ဆင့် ငွေလွှဲသည်။
2. Customer သည် payment screenshot ကို Telegram bot သို့ ပို့သည်။ Caption တွင် order/reference number သို့မဟုတ် provider ကို ထည့်ပေးနိုင်သည်။
3. Telegram သည် `POST /telegram/webhook` သို့ update ပို့သည်။ Backend သည် webhook secret token ကို validate လုပ်ပြီး Telegram `update_id` ကို idempotency key အဖြစ် အသုံးပြုသည်။
4. Duplicate delivery ဖြစ်ပါက update ကို ပြန်လည် process မလုပ်ဘဲ ယခင် result ကို return ပြုလုပ်မည်။ Message တစ်ခုတွင် media များစွာ ပါနိုင်သောကြောင့် message-level နှင့် media-level identity နှစ်ခုလုံးကို စဉ်းစားရမည်။
5. Backend သည် Telegram file ကို download လုပ်ပြီး MIME type, file size နှင့် image signature ကို validate ပြုလုပ်ကာ Cloudflare R2 private bucket သို့ upload လုပ်သည်။
6. `payment_screenshots` row ကို `RECEIVED` status ဖြင့် create လုပ်မည်။ Provider မသိသေးပါက `submitted_provider` နှင့် `detected_provider` ကို null ထားနိုင်သည်။
7. File hash တူညီသော screenshot ပြန်ပို့ခြင်းကို `DUPLICATE_SUBMISSION` အဖြစ် mark လုပ်နိုင်ရန် hash-based deduplication ထားရမည်။ ဤ submission duplicate သည် wallet transaction duplicate နှင့် မတူကြောင်း UI တွင် ခွဲပြရမည်။

### 3.2 Phase B — Import and Verification Run

1. Admin သည် provider တစ်ခုချင်းစီအတွက် wallet history export file ကို download လုပ်သည်။
2. Flutter admin app တွင် provider ကိုရွေးချယ်ပြီး file upload ပြုလုပ်သည်။ Backend သည် raw file ကို R2 တွင်သိမ်းကာ `payment_imports` row တစ်ခု create လုပ်သည်။
3. Import အဆင့်တွင် file checksum, provider, business date, parser version နှင့် source filename ကိုသိမ်းမည်။ File တူညီမှုကိုသိရှိနိုင်ရန် `(provider, file_hash)` အပေါ် idempotency သတ်မှတ်မည်။
4. Provider-specific parser သည် raw rows များကို canonical transaction model သို့ normalize လုပ်မည်။ Parsing error ရှိသော row များကို လုံးဝ discard မလုပ်ဘဲ `payment_import_errors` table တွင် row number နှင့် error reason ဖြင့်သိမ်းမည်။
5. Time handling အတွက် source local time ကို `transaction_at_local` နှင့် timezone `Asia/Yangon` ဖြင့်သိမ်းနိုင်သော်လည်း matching အတွက် UTC instant (`transaction_at_utc`) ကိုလည်း သိမ်းထားရမည်။ `business_date` သည် Myanmar local calendar date အဖြစ် သီးခြား field ဖြစ်ရမည်။
6. Admin သည် provider, business date/date range နှင့် scope ကိုရွေးချယ်ပြီး “Start Verification” ကို နေ့ဘက် သို့မဟုတ် ညဘက် မည်သည့်အချိန်တွင်မဆိုနှိပ်နိုင်သည်။ ထို့အပြင် configured schedule ဖြင့် automatic run ပြုလုပ်နိုင်သည်။ Batch သည် `trigger_type` (`MANUAL` သို့မဟုတ် `SCHEDULED`), business date/date range, provider scope နှင့် configuration snapshot တို့ကို သိမ်းထားရမည်။ တူညီသော scope အပေါ် batch နှစ်ခု တပြိုင်နက် run မဖြစ်စေရန် active-batch lock ထားရမည်။
7. Worker သည် ယခင် batch များနှင့်မထပ်သော `RECEIVED` screenshots များကို lease/lock ဖြင့်ယူပြီး OCR ပြုလုပ်မည်။ Screenshot တစ်ခုကို worker များစွာက တပြိုင်နက် process မလုပ်စေရန် database row lock သို့မဟုတ် lease expiry ထားရမည်။
8. OCR result တွင် raw text, provider detection result, extracted fields, per-field confidence, OCR engine/version နှင့် processing error ကိုသိမ်းမည်။ OCR failure သည် အလိုအလျောက် retry နှစ်ကြိမ်အထိ ပြုလုပ်ပြီးနောက် `FAILED` သို့ သတ်မှတ်မည်။
9. Provider-specific matching engine သည် detected/submitted provider ကို အခြေခံကာ သက်ဆိုင်ရာ `payment_transactions` များကိုသာ query လုပ်မည်။ Provider မသေချာပါက cross-provider auto-match မလုပ်ဘဲ manual review သို့ ပို့မည်။
10. Match result ကို confidence နှင့် reason code ဖြင့်သိမ်းမည်။ Exact transaction ID match ဖြစ်သော်လည်း amount သို့မဟုတ် date အလွန်မကိုက်ပါက silent auto-verify မလုပ်ရ။
11. Wallet transaction တစ်ခုကို screenshot တစ်ခုထက်ပိုပြီး အောင်မြင်စွာအသုံးမပြုနိုင်စေရန် database unique constraint နှင့် transaction lock ဖြင့် atomic reservation ပြုလုပ်မည်။
12. Batch ပြီးဆုံးချိန်တွင် verified, duplicate, unmatched, pending review နှင့် failed အရေအတွက်များကို summary အဖြစ်သိမ်းမည်။ Admin ထံသို့ FCM notification ပို့နိုင်သည်။

### 3.3 Phase C — Admin Review

Admin သည် `PENDING_REVIEW`, `UNMATCHED`, OCR `FAILED` နှင့် duplicate-related cases များကို စစ်ဆေးနိုင်ရမည်။ Review screen တွင် screenshot, OCR extracted fields, raw OCR text, provider, candidate wallet transactions, match score နှင့် reason codes များကို side-by-side ပြရမည်။

Admin action များမှာ `APPROVE`, `REJECT`, `MARK_DUPLICATE`, `REPROCESS_OCR` နှင့် `OVERRIDE_PROVIDER` တို့ဖြစ်နိုင်သည်။ Action တစ်ခုစီတွင် actor, timestamp, old status, new status, selected transaction နှင့် reason/comment ကို `audit_logs` တွင်သိမ်းမည်။ Manual action များသည် idempotent ဖြစ်ရမည်။

---

## 4. Matching Policy

### 4.1 Match Priority

| Level | Conditions | Auto-verification |
|---|---|---|
| Level 1 | Same provider + normalized transaction ID exact match; amount and date sanity checks pass | Allowed when confidence threshold passes |
| Level 2 | Same provider + exact amount + date/business-date constraint + time tolerance window; transaction ID unavailable or unreadable | Allowed only if exactly one candidate and all required fields are reliable |
| Level 3 | Level 2 candidate plus sender/receiver name similarity or reference similarity | Prefer manual review unless threshold and one-to-one rules are explicitly approved |
| No match | No candidate, invalid fields, provider conflict, or low confidence | `UNMATCHED` or `PENDING_REVIEW` |

### 4.2 Required Matching Safeguards

Matching engine တွင် အောက်ပါ rules များကို ထည့်သွင်းရမည်။

* Amount ကို floating-point ဖြင့် မသိမ်းဘဲ `numeric(18,2)` ဖြင့် သိမ်းရမည်။ Currency တူညီမှုကို စစ်ရမည်။
* Date/time မရှိသော screenshot ကို Level 2 auto-match မပြုလုပ်ရ။
* Candidate တစ်ခုထက်ပိုပါက auto-verify မလုပ်ဘဲ `PENDING_REVIEW` သို့ ပို့ရမည်။
* One-to-one consumption rule အရ transaction တစ်ခုကို verified screenshot တစ်ခုတွင်သာ reserve လုပ်နိုင်ရမည်။
* Exact transaction ID တွင် OCR typo ဖြစ်နိုင်သောကြောင့် normalization နှင့် sanity check လုပ်ရမည်။ OCR မှ ထုတ်ယူထားသော ID သည် import ထဲရှိ ID နှင့် exact မကိုက်လျှင် fuzzy ID match ကို auto-verify အတွက် မသုံးရ။
* Provider detection confidence နိမ့်ခြင်း သို့မဟုတ် submitted provider နှင့် detected provider မကိုက်ခြင်းကို manual review သို့ ပို့ရမည်။
* Matching rule version, tolerance configuration နှင့် candidate list ကို result row တွင် snapshot အဖြစ် သိမ်းထားရမည်။ နောက်ပိုင်း rule ပြောင်းလဲသော်လည်း ယခင်ဆုံးဖြတ်ချက်ကို ပြန်လည်ရှင်းလင်းနိုင်ရမည်။

### 4.3 Level 2 Tolerance Configuration

Tolerance window သည် global constant မဟုတ်ဘဲ provider နှင့် business rule အလိုက် configuration ဖြင့်ထားရန် အကြံပြုသည်။ ဥပမာအနေဖြင့် `±2 minutes` ကို default candidate value အဖြစ်သာ သတ်မှတ်နိုင်ပြီး production value အဖြစ် မသတ်မှတ်မီ actual export နှင့် screenshot sample များပေါ်တွင် validate လုပ်ရမည်။

Configuration တွင် `before_minutes`, `after_minutes`, date boundary behavior, missing-time behavior, amount tolerance, currency rule နှင့် auto-verify threshold တို့ ပါရမည်။ ဥပမာ `23:59` နှင့် `00:01` ကို business date အလိုက် မည်သို့စစ်မည်ဆိုသည်ကို သတ်မှတ်ထားရမည်။

---

## 5. System Architecture

```text
                    ┌─────────────────────┐
                    │   Flutter Admin App │
                    │  Riverpod + Dio     │
                    └──────────┬──────────┘
                               │ HTTPS
                               ▼
                    ┌─────────────────────┐
                    │   Nginx / Caddy     │
                    │   TLS termination   │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │  NestJS + TypeScript│
                    │ Auth / Telegram /   │
                    │ Imports / OCR /     │
                    │ Verification /     │
                    │ Reports / Audit     │
                    └──────┬───────┬──────┘
                           │       │
              ┌────────────┘       └─────────────┐
              ▼                                  ▼
     ┌─────────────────┐                ┌──────────────────┐
     │   PostgreSQL    │                │  Cloudflare R2   │
     │ transactional   │                │ private bucket  │
     │ data + locks    │                │ presigned URLs  │
     └─────────────────┘                └──────────────────┘
              │                                  │
              ▼                                  ▼
     ┌─────────────────┐                ┌──────────────────┐
      │ Batch Worker    │                │ Google Vision    │
      │ trigger + leases│───────────────▶│ OCR API          │
     └─────────────────┘                └──────────────────┘

     Telegram Bot API ──webhook──▶ NestJS
     NestJS ──completion event──▶ FCM (optional)
     NestJS ──errors/metrics────▶ Sentry / monitoring
```

MVP တွင် API နှင့် worker ကို Docker service တစ်ခုတည်းအတွင်း run နိုင်သော်လည်း scheduler duplicate run မဖြစ်စေရန် PostgreSQL advisory lock သို့မဟုတ် equivalent distributed lock ထားရမည်။ Load တိုးလာပါက API, worker နှင့် scheduler ကို သီးခြား service များအဖြစ် ခွဲထုတ်နိုင်သည်။

---

## 6. Final Technology Stack

| Layer | Technology | Design decision |
|---|---|---|
| Admin mobile | Flutter + Riverpod + Dio | Provider-wise dashboard, upload, review, reporting |
| Backend API | NestJS + TypeScript | REST API, validation, RBAC, Swagger/OpenAPI |
| Database | PostgreSQL | Transactional records, unique constraints, row locks, audit trail |
| Object storage | Cloudflare R2 | Private bucket; short-lived presigned URLs only |
| Local object storage | MinIO | Development/test compatibility with S3 API |
| OCR | Google Cloud Vision API | OCR only; provider-aware extraction is owned by application code |
| Telegram | Telegram Bot API + webhook | Secret validation and idempotent update processing |
| Batch execution | NestJS worker/cron | On-demand and scheduled, resumable, lease-based processing |
| Queue | None in MVP | Add BullMQ + Redis when volume/retry isolation requires it |
| Push notification | FCM, optional | Batch completion and exceptional failure notification |
| Reverse proxy | Nginx or Caddy | HTTPS and request-size controls |
| Deployment | Docker Compose initially | Separate API/worker services when scale requires |
| Monitoring | Sentry + structured application logs | Error tracking, batch metrics, retry visibility |
| API documentation | Swagger/OpenAPI | Contract for Flutter integration |
| Database migration | Prisma/Drizzle/TypeORM migrations | One migration authority must be selected before implementation |

**Implementation decision required:** NestJS တွင် PostgreSQL access အတွက် Prisma, Drizzle သို့မဟုတ် TypeORM ထဲမှ တစ်ခုကိုရွေးပြီး schema migration နှင့် transaction conventions ကို project အစတွင် lock လုပ်ရမည်။

---

## 7. Database Schema

အောက်ပါ schema သည် core entities နှင့် အရေးကြီးသော constraints များကို ဖော်ပြသည်။ Actual ORM syntax ကို implementation phase တွင် သတ်မှတ်မည်။

```text
users
  id, role, display_name, email_or_phone, status,
  created_at, updated_at

telegram_users
  id, telegram_user_id, username, first_seen_at, last_seen_at
  UNIQUE(telegram_user_id)

payment_imports
  id, provider, business_date, file_name, storage_key,
  file_hash, parser_version, total_rows, parsed_rows,
  error_rows, status, uploaded_by, created_at, completed_at
  UNIQUE(provider, file_hash)

payment_import_errors
  id, import_id, source_row_number, raw_row_reference,
  error_code, error_message, created_at

payment_transactions
  id, provider, external_transaction_id, amount, currency,
  transaction_at_utc, transaction_at_local, local_timezone,
  business_date, sender_name, receiver_name, reference,
  source_import_id, fingerprint, raw_row_json, created_at
  UNIQUE(provider, external_transaction_id) WHERE external_transaction_id IS NOT NULL

payment_screenshots
  id, telegram_update_id, telegram_message_id, telegram_user_id,
  storage_key, file_hash, mime_type, file_size_bytes,
  submitted_provider, detected_provider, received_at,
  status, last_error, created_at, updated_at
  UNIQUE(telegram_update_id)
  INDEX(file_hash)

ocr_results
  id, screenshot_id, ocr_engine, ocr_engine_version,
  provider, raw_text, extracted_amount, extracted_currency,
  extracted_transaction_id, extracted_date, extracted_time,
  extracted_sender, extracted_receiver, field_confidence_json,
  overall_confidence, attempt_number, status, error_message,
  created_at

verification_batches
  id, business_date, status, trigger_type, config_snapshot_json,
  total_screenshots, processed, matched, duplicate,
  pending_review, unmatched, failed, started_at, completed_at,
  created_by, created_at

verification_results
  id, batch_id, screenshot_id, provider, transaction_id,
  status, match_level, match_score, reason_code,
  candidate_snapshot_json, rule_version, tolerance_snapshot_json,
  reviewed_by, reviewed_at, review_comment, verified_at, created_at
  UNIQUE(batch_id, screenshot_id)

used_transactions
  id, provider, transaction_id, screenshot_id, used_at
  UNIQUE(provider, transaction_id)

notifications
  id, recipient_user_id, type, payload_json, status,
  sent_at, failure_reason, created_at

audit_logs
  id, actor_user_id, action, entity_type, entity_id,
  old_value_json, new_value_json, reason, ip_address,
  created_at
```

### 7.1 Schema Notes

`external_transaction_id` သည် provider export တွင် မပါနိုင်သောအခြေအနေကို ထောက်ပံ့ရန် nullable ဖြစ်ရမည်။ ထို့ကြောင့် nullable ID အပေါ် global uniqueness မထားဘဲ provider အလိုက် non-null partial unique index ထားသင့်သည်။ Export တစ်ခုတည်းကို ပြန် upload လုပ်ခြင်းနှင့် transaction တစ်ခုကို export အမျိုးမျိုးတွင် ပြန်တွေ့ခြင်းကို file hash, source import နှင့် fingerprint တို့ဖြင့် သီးခြားစီ handle လုပ်ရမည်။

`used_transactions` နှင့် `verification_results` ကို တစ်ဆင့်ချင်းရေးသားခြင်းအစား transaction တစ်ခုအတွင်း lock/reserve လုပ်ရမည်။ Unique constraint ကို final safety net အဖြစ်ထားပြီး race condition ကို application logic တစ်ခုတည်းဖြင့် မဖြေရှင်းရ။

Payment screenshot နှင့် OCR raw text တွင် personal data ပါနိုင်သောကြောင့် retention policy, deletion policy နှင့် access logging ကို deployment မတိုင်မီ သတ်မှတ်ရမည်။

---

## 8. Provider-Aware Components

### 8.1 Import Parser

```text
src/imports/parsers/
  parser.interface.ts
  parser-registry.ts
  kbzpay.parser.ts
  ayapay.parser.ts
  wavepay.parser.ts
  canonical-transaction.mapper.ts
```

Parser တစ်ခုစီသည် provider-specific raw row ကို canonical `PaymentTransaction` အဖြစ်ပြောင်းပေးရမည်။ Parser result တွင် normalized row, source row number, validation errors နှင့် parser version ပါရမည်။ CSV နှင့် Excel နှစ်မျိုးလုံးကို လက်ခံပါက encoding, header row position, number format နှင့် date format များကို sample files ဖြင့် test လုပ်ရမည်။

### 8.2 OCR Extraction

```text
src/ocr/
  ocr.service.ts
  vision.service.ts
  provider-detector.ts
  extractors/
    kbzpay.extractor.ts
    ayapay.extractor.ts
    wavepay.extractor.ts
  extraction-normalizer.ts
```

OCR pipeline သည် raw text ရယူခြင်း၊ provider detection ပြုလုပ်ခြင်း၊ field extraction ပြုလုပ်ခြင်း၊ normalization ပြုလုပ်ခြင်းနှင့် confidence တွက်ချက်ခြင်းဟူသော အဆင့်များဖြင့်လုပ်ဆောင်ရမည်။ Branding keyword မတွေ့ခြင်း သို့မဟုတ် field confidence မလုံလောက်ခြင်းသည် failure မဟုတ်ဘဲ reviewable ambiguity ဖြစ်နိုင်သောကြောင့် reason code ဖြင့်ခွဲထားရမည်။

### 8.3 Matching Engine

```text
src/verification/
  verification-engine.ts
  candidate-search.service.ts
  scoring.service.ts
  duplicate-detector.ts
  transaction-reservation.service.ts
  review-resolution.service.ts
```

Matching query သည် provider-scoped ဖြစ်ရမည်။ Candidate query တွင် business date, amount, currency နှင့် configured time window ကို အသုံးပြုရမည်။ Result သည် selected candidate တစ်ခုတည်းကိုသာ မဟုတ်ဘဲ candidate ranking နှင့် reason codes အားလုံးကို သိမ်းထားရမည်။

---

## 9. NestJS Backend Structure

```text
src/
  auth/
  users/
  telegram/
    telegram.controller.ts
    telegram.service.ts
    telegram-webhook.service.ts
    telegram-idempotency.service.ts
  payments/
    payments.controller.ts
    payments.service.ts
  imports/
    imports.controller.ts
    imports.service.ts
    parsers/
  screenshots/
  ocr/
  verification/
  reports/
  notifications/
  storage/
    r2.service.ts
    presigned-url.service.ts
  audit/
  database/
  health/
  config/
  main.ts
```

အရေးကြီးသော implementation rules များမှာ webhook နှင့် upload endpoint များတွင် request validation ထားခြင်း၊ worker operation များတွင် transaction boundary သတ်မှတ်ခြင်း၊ batch scheduler တွင် distributed lock ထားခြင်း၊ နှင့် status transition များကို explicit state machine ဖြင့် validate ပြုလုပ်ခြင်းတို့ဖြစ်သည်။

### 9.1 Suggested Status States

| Entity | States |
|---|---|
| Screenshot | `RECEIVED`, `PROCESSING`, `OCR_COMPLETED`, `PENDING_REVIEW`, `VERIFIED`, `DUPLICATE`, `UNMATCHED`, `FAILED`, `REJECTED` |
| Import | `UPLOADED`, `PARSING`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED` |
| Batch | `CREATED`, `RUNNING`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED` |
| Review | `OPEN`, `APPROVED`, `REJECTED`, `MARKED_DUPLICATE`, `REPROCESSED` |

---

## 10. Flutter Admin App Structure

```text
lib/
  core/
    network/
    storage/
    theme/
    constants/
  features/
    auth/
    dashboard/
    payment_import/
    screenshots/
    verification/
    transactions/
    duplicate/
    reports/
    settings/
  main.dart
```

Dashboard တွင် business date အလိုက် provider-wise summary ကို ပြရမည်။ KBZPay, AYA Pay နှင့် WavePay အလိုက် `verified`, `duplicate`, `pending review`, `unmatched` နှင့် `failed` counts များကို ခွဲခြားပြရမည်။ Review list တွင် filter, sort, provider filter, amount/date search နှင့် candidate transaction detail များ ပါရမည်။

---

## 11. Security and Privacy

```text
Flutter ──HTTPS──▶ Nginx/Caddy ──▶ NestJS ──▶ PostgreSQL
                                      └──────▶ R2 / OCR provider
```

အောက်ပါ controls များကို MVP အတွင်းထည့်သွင်းရမည်။

* JWT authentication နှင့် refresh-token rotation ကို အသုံးပြု၍ admin session ကို ကာကွယ်ရမည်။
* Role-based access control ဖြင့် upload, verification, manual approval, export နှင့် settings permissions များကို ခွဲရမည်။
* Request validation, rate limiting, CORS policy နှင့် upload MIME/size validation ထားရမည်။
* Telegram webhook secret token ကို server-side တွင်သာ validate လုပ်ရမည်။ Telegram bot token ကို Flutter application ထဲ မထည့်ရ။
* R2 bucket ကို private ထားပြီး short-lived presigned URL ဖြင့်သာ file access ပေးရမည်။ URL expiry နှင့် download audit ကို စဉ်းစားရမည်။
* Secrets များကို environment variable သို့မဟုတ် secret manager ထဲတွင်သာထားရမည်။
* Screenshot, sender/receiver name, Telegram identifier နှင့် OCR raw text တို့အတွက် least-privilege access, retention period နှင့် deletion workflow သတ်မှတ်ရမည်။
* Admin action အားလုံးကို audit log တွင် actor, timestamp, entity, old/new status နှင့် reason ဖြင့်သိမ်းရမည်။
* Import file နှင့် screenshot upload များတွင် file signature validation ပြုလုပ်ပြီး production deployment တွင် malware scanning requirement ကို သတ်မှတ်ရမည်။
* Database backup, restore test, migration rollback နှင့် encryption-at-rest setting များကို operational runbook ထဲတွင် ထည့်ရမည်။

---

## 12. Deployment and Operations

```text
Internet
   │
   ▼
Cloudflare ──▶ Nginx/Caddy ──▶ NestJS API
                                  ├── PostgreSQL
                                  ├── Cloudflare R2
                                  ├── Telegram Bot API
                                  ├── Google Vision OCR
                                  └── FCM (optional)

Manual trigger / scheduler ──▶ locked batch worker
```

MVP deployment တွင် API နှင့် worker ကို Docker Compose ဖြင့် run နိုင်သည်။ Worker သည် admin ၏ on-demand request နှင့် scheduler ၏ automatic request နှစ်မျိုးလုံးကို လက်ခံရမည်။ Worker process သည် batch တစ်ခုကို run နေစဉ် process restart ဖြစ်ပါက lease expiry ပြီးနောက် pending work ကို ပြန်ယူနိုင်ရမည်။ တူညီသော provider/date scope အတွက် active batch ရှိပြီးသားဖြစ်ပါက ထပ်မံ run မပြုလုပ်ဘဲ existing batch ကိုပြသရန် သို့မဟုတ် explicit re-run confirmation တောင်းရန် သတ်မှတ်ရမည်။ Batch summary သည် partial failure များကို မဖုံးကွယ်စေရန် `COMPLETED_WITH_ERRORS` ကို အသုံးပြုနိုင်ရမည်။

Operational minimum များတွင် health endpoint, database migration command, structured logs, OCR retry metrics, import row-error metrics, batch duration, unmatched rate နှင့် notification failure monitoring တို့ ပါရမည်။

---

## 13. Environment Variables

```text
NODE_ENV=
PORT=
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PRESIGNED_URL_TTL_SECONDS=

GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=

FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=

SENTRY_DSN=
SCREENSHOT_RETENTION_DAYS=
IMPORT_RETENTION_DAYS=
```

Production secrets များကို `.env` file ထဲတွင် repository သို့ commit မလုပ်ရ။ `GOOGLE_APPLICATION_CREDENTIALS` သည် file path ဖြစ်ပါက deployment secret mount path နှင့်ညီရမည်။ FCM နှင့် Google credentials အတွက် actual secret management method ကို deployment environment အလိုက် သတ်မှတ်ရမည်။

---

## 14. MVP Scope and Deferred Items

MVP တွင် PostgreSQL-backed resumable worker, provider-aware parser/OCR, manual review, audit logs နှင့် reporting ကို ဦးစားပေးမည်။ Verification သည် admin-triggered on-demand run နှင့် configured scheduled run နှစ်မျိုးလုံးကို support လုပ်ရမည်။ Redis/BullMQ သည် screenshot volume, retry isolation သို့မဟုတ် multi-worker requirement မြင့်လာသောအခါ ထည့်မည်။ Realtime WebSocket/Supabase Realtime သည် provider API-based real-time verification မပါဝင်သည့် MVP အတွက် မလိုအပ်သေးပါ။ Multiple worker servers များကို database lease နှင့် monitoring လုံလောက်ပြီး scale တိုးလာသည့်အခါ ထည့်မည်။

Deferred ဖြစ်သော်လည်း implementation မစမီ ဆုံးဖြတ်ရမည့်အရာများမှာ ORM/migration tool, deployment target, retention period, provider export access procedure, admin role matrix နှင့် backup/restore ownership တို့ဖြစ်သည်။

---

## 15. Open Items to Confirm Before Implementation

### Priority 0 — Blocking Inputs

| Open item | ဆုံးဖြတ်ရမည့်အချက် | Owner / evidence | Acceptance criterion |
|---|---|---|---|
| Level 2 tolerance window | Provider တစ်ခုချင်းစီအတွက် before/after minutes, date boundary, missing-time rule | Product owner + real transaction samples | Written configuration approved; test cases pass |
| KBZPay export sample | Actual CSV/Excel file, headers, encoding, date/time, timezone, duplicate/reversal behavior | Operations | Parser fixture test created |
| AYA Pay export sample | Actual CSV/Excel file, headers, encoding, date/time, timezone, duplicate/reversal behavior | Operations | Parser fixture test created |
| WavePay export sample | Actual CSV/Excel file, headers, encoding, date/time, timezone, duplicate/reversal behavior | Operations | Parser fixture test created |
| Screenshot samples | Provider တစ်ခုချင်းစီအတွက် clear, compressed, cropped, old/new layout samples | Operations | OCR fixture set created |

### Priority 1 — Business Rules

| Open item | ဆုံးဖြတ်ရမည့်အချက် |
|---|---|
| Run scheduling and business date | Manual run မည်သည့်အချိန်တွင်ခွင့်ပြုမည်၊ scheduled run အချိန်များ၊ same-day/date-range definition, late-night transaction နှင့် midnight crossing ကို မည်သို့ handle မည်နည်း |
| Provider submission | Customer/provider selection ကို Telegram caption, bot menu သို့မဟုတ် admin override ဖြင့် မည်သို့ယူမည်နည်း |
| Auto-verify threshold | Level 1/2/3 တွင် မည်သည့် conditions ဖြင့် auto-verification ခွင့်ပြုမည်နည်း |
| Amount rule | Exact amount သာလား၊ fee/rounding tolerance ရှိလား၊ currency အမျိုးမျိုးကို ထောက်ပံ့မလား |
| Duplicate policy | Same wallet transaction ကို multiple screenshots ဖြင့်ပို့လျှင် first-in wins လား၊ admin approval လိုလား |
| Reversal/refund | Reversed, refunded, pending, failed wallet records များကို မည်သို့ report မည်နည်း |
| Manual review outcome | Approve, reject, duplicate, reprocess နှင့် override provider actions အတွက် permission matrix |
| Reporting | Daily report format, recipients, export format နှင့် reporting timezone |

### Priority 2 — Operational and Security Decisions

| Open item | ဆုံးဖြတ်ရမည့်အချက် |
|---|---|
| Retention | Screenshot, raw OCR, export file နှင့် audit log တို့၏ retention/deletion period |
| Backup | PostgreSQL backup frequency, RPO/RTO နှင့် restore test owner |
| Deployment | Docker host/cloud target, TLS certificate management, monitoring destination |
| OCR cost control | Maximum image size, preprocessing, retry cap နှင့် monthly budget guardrail |
| Access control | Admin roles, approver separation, account deactivation နှင့် session policy |
| Incident handling | Import corruption, OCR outage, duplicate spike နှင့် provider format change အတွက် runbook |

### 15.1 Sample Collection Checklist

Provider တစ်ခုစီအတွက် အောက်ပါ sample set ကို စုဆောင်းရမည်။

1. Successful payment screenshot — clear original image.
2. Compressed screenshot — Telegram compression ဖြစ်ပြီးနောက် ရရှိသော image.
3. Cropped screenshot — branding သို့မဟုတ် transaction ID မပါသော variation.
4. Screenshot with Burmese/English mixed text, if applicable.
5. Export file with at least one successful transaction.
6. Export file containing multiple transactions on the same date.
7. Export file containing failed, pending, reversed သို့မဟုတ် refunded rows, if available.
8. The same transaction appearing in two exports, if operationally possible.
9. One transaction near midnight to validate business-date and tolerance behavior.

Sample များကို PII masking လုပ်ထားသော်လည်း parser/OCR အတွက် လိုအပ်သော column positions, identifier patterns, amount format နှင့် timestamp format များ မပျက်စေရ။ Sample files များကို repository ထဲမထည့်ဘဲ restricted fixture storage တွင် version နှင့် access log ဖြင့် ထိန်းသိမ်းသင့်သည်။

---

## 16. Implementation Readiness Gate

Implementation စတင်ရန် အောက်ပါအချက်များအားလုံးကို approve ဖြစ်ထားရမည်။

| Gate | Required evidence |
|---|---|
| Provider contract | Canonical provider enum and display labels approved |
| Parser contract | Three real export samples and expected normalized rows |
| OCR contract | Three screenshot fixture sets and expected extracted fields |
| Matching contract | Level 1/2/3 rules, tolerance values and sample test cases |
| Data contract | ORM choice, migration strategy, status transitions and constraints |
| Security contract | Roles, retention, presigned URL TTL, secret management and audit requirements |
| Operations contract | Manual/scheduled trigger rules, schedule timezone, concurrency policy, retry policy, backup, monitoring and failure runbook |

ဤ gate များမပြီးမချင်း tolerance ကို production value အဖြစ် lock မလုပ်ရ၊ provider-specific parser/regex ကို “final” ဟု မသတ်မှတ်ရ။
