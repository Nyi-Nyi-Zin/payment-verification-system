# Payment Desk UI verification

The frontend is now a Next.js App Router static export with strict TypeScript, Tailwind CSS v4, TanStack React Query and Zod/React Hook Form. Its light blue workspace prioritizes Excel readiness, receipt selection, progress and the selected result. The six large summary cards have been replaced with compact result filters. Result explanations appear before the image. The existing NestJS endpoints, database schema, Tesseract engine and matching rules are unchanged by this UI work.

## Operator workflow

- Myanmar is the initial language. The header switches Myanmar/English on both login and workspace screens; the preference is stored locally. Language changes preserve selected files, active jobs and results. Dates use Myanmar time, 24-hour time and Latin digits in either language.
- Choose or drop one or multiple PNG/JPEG/WebP files, up to 10 MB per file. Invalid files remain visible with an explanation and can be removed. Start checking once; the browser sends one receipt at a time through the existing upload endpoint.
- Pause finishes the current request before stopping. Resume sends only the remaining files. Navigating between workspace tabs does not stop processing. An activity shortcut returns to the current upload set.
- The current upload set includes every receipt date. The history date selector only filters saved receipts and wallet history; it never changes automatically for each upload.
- Exact image duplicates display as Duplicate attempts even when the original saved receipt is Match. The original result is clearly identified. Payment duplicates, absent transactions, amount differences and OCR/setup failures have separate explanations.
- Retry uses the existing screenshot process endpoint when its ID is known. A network failure before an ID is received retains the file for an idempotent upload retry. Terminal matches and duplicates are not reprocessed.
- Pending files live only in this page. Reload/close prompts while unsent files remain; completed records remain in saved history. There is no background batch job or automatic continuation after closing the page.
- Fonts and Lucide icons are served locally; their licenses are included beside the assets. The selected image opens in a native dialog with keyboard/Escape handling.

## Checks performed

- `npm --prefix frontend test` (also `pnpm test:ui` in backend): eighteen queue/translation/form/API/cache tests covering validation, serial execution, repeated Start clicks, pause/resume, per-file failure recovery, saved-ID retries, session loss, safe removal, duplicate interpretation and translation-key parity.
- `pnpm test:ui-browser`: actual frontend/CSP with synthetic API fixtures. Exercises drag/drop, single and mixed-result selections, invalid/empty/oversized files, removal, language changes and navigation during work, cross-date results, both duplicate types, missing/mismatched payments, network/OCR retry, leave protection, image dialog and language persistence.
- Browser fixtures are captured in both languages at **1440×900**, **1280×720** and **390×844**. Checks assert no document horizontal overflow, visible buttons at least 44 px tall, result focus and sample text contrast of at least 4.5:1. This is targeted accessibility verification, not a complete accessibility certification.
- The HTTP integration suite also drives the redesigned UI against real NestJS/PostgreSQL in a unique disposable schema. OCR uses the existing injected test adapter in that suite; this does not claim new live-image OCR accuracy or production/device deployment verification.

The export has been tested through actual NestJS and PostgreSQL with the injected OCR adapter. Docker/production deployment and new live OCR accuracy were not verified in this migration.

Browser scripts default to the locked frontend Playwright dependency and accept `PLAYWRIGHT_MODULE` for an installed Playwright package and optional `CHROME_EXECUTABLE`. Screenshots go to ignored `.qa-tools/` directories. No private receipt data is included in these UI fixtures.
