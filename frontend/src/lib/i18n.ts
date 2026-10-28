import type { Locale } from "./types";
import { authMessages } from "./auth-i18n";

export const messages: Record<Locale, Record<string, string>> = {
  en: {
    workspace: "KBZPay workspace",
    signOut: "Sign out",
    switchLanguage: "မြန်မာ",
    loginEyebrow: "A clearer way to check payments",
    loginTitle: "Every receipt.\nA clear answer.",
    loginIntro:
      "Bring your Excel history and receipts together. Find the match, catch duplicates, and know what needs another look.",
    loginFeature1: "Compare with your actual Excel history",
    loginFeature2: "Check one receipt or a whole set",
    loginFeature3: "Read receipts locally. No cloud OCR needed.",
    welcome: "Welcome back",
    loginHelp: "Sign in to your payment workspace.",
    email: "Email or phone",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    privateWorkspace: "Your administrator account is required.",
    navCheck: "Check receipts",
    navImports: "Excel imports",
    navWallet: "Wallet history",
    automatic: "Automatic comparison",
    localPrivate: "Local receipt reading",
    noApproval: "Upload. Check. See the result.",
    titleCheck: "Check your receipts",
    introCheck:
      "Add your Excel history, then check one receipt or several together.",
    titleImports: "Your Excel imports",
    introImports:
      "Every statement, with its imported transactions and row-level results.",
    titleWallet: "Incoming wallet history",
    introWallet:
      "Find an imported transaction and see whether a receipt already uses it.",
    historyDate: "History date",
    myanmarTime: "Myanmar time · UTC+06:30",
    step1: "01",
    step2: "02",
    excelReady: "Excel history is ready",
    excelMissing: "Start with your Excel history",
    excelMissingHelp:
      "Import your official KBZPay statement so there is history to compare with.",
    excelMeta: "Statements: {count} · Last import {date}",
    updateExcel: "Update Excel",
    importExcel: "Import Excel",
    importing: "Importing…",
    viewImports: "View imports",
    excelHelp: "KBZPay .xlsx · all statement dates · up to 10 MB",
    selectExcel: "Choose Excel statement",
    selectedExcel: "Selected: {name}",
    requestFailedTitle: "This request didn’t finish",
    chooseReceipts: "Choose your receipts",
    dropTitle: "Drop receipt images here",
    dropHelp: "One image or several · PNG, JPEG, WebP · up to 10 MB each",
    chooseImages: "Choose images",
    dropActive: "Drop to add these receipts",
    selectHint:
      "Selected files appear in the list below. Nothing is sent until you start.",
    selectedFiles: "Selected: {count}",
    readyFiles: "Ready to check: {count}",
    checkReceipts: "Check receipts",
    checkCount: "Check receipts ({count})",
    resume: "Resume checking",
    pause: "Pause",
    pausing: "Pausing after this receipt…",
    paused: "Paused · {done} of {total} checked",
    checking: "Checking {number} of {total}",
    finished: "All done · {done} of {total} checked",
    readyProgress: "Ready to check: {count}",
    batchScope: "This upload set · all receipt dates",
    pageOpen: "Keep this page open while your receipts are checked.",
    backToBatch: "Back to receipts",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    thisBatch: "This upload set",
    savedReceipts: "Saved receipts",
    listTitle: "Your receipts",
    listCount: "Receipts: {count}",
    noFiles: "Your receipts will appear here",
    noFilesHelp:
      "Choose images above to get started. You can add one receipt or several.",
    noSaved: "No receipts for this date",
    noSavedHelp: "Choose another history date or upload a receipt.",
    noFiltered: "No receipts in this group",
    clearFilter: "Show all",
    all: "All",
    matches: "Match",
    duplicates: "Duplicate",
    notFound: "Not found",
    attention: "Needs attention",
    pending: "Waiting",
    removeFile: "Remove {name}",
    fileSize: "{size} MB",
    originalReceipt: "Original receipt",
    receipt: "Receipt",
    excel: "Excel history",
    result: "Result",
    resultEmpty: "A clear answer, right here",
    resultEmptyHelp:
      "Select a receipt to see its result and the corresponding Excel details.",
    queuedTitle: "Ready to check",
    checkingTitle: "Reading and checking…",
    matchTitle: "This receipt matches",
    duplicateTitle: "This payment was already used",
    imageDuplicateTitle: "This image was already uploaded",
    notFoundTitle: "Not found in Excel",
    mismatchTitle: "The amount does not match",
    uncertainTitle: "No unique match",
    readFailedTitle: "We couldn’t read this receipt",
    serviceFailedTitle: "Receipt reading is unavailable",
    fileErrorTitle: "This file needs attention",
    rejectedTitle: "Rejected receipt",
    notCheckedTitle: "This receipt has not been checked",
    retry: "Check again",
    retrying: "Checking again…",
    retryUpload: "Retry upload",
    cannotRetry: "This result is already final.",
    preview: "Receipt image",
    zoom: "View full size",
    close: "Close",
    imageLoading: "Loading receipt image…",
    imageUnavailable:
      "The image is unavailable. Select this receipt again to reload it.",
    imagePending: "The receipt image will appear here.",
    detailsTitle: "Compared details",
    field: "Field",
    transactionId: "Transaction ID",
    amount: "Amount · MMK",
    receiptDate: "Receipt date",
    time: "Time · Myanmar",
    receiver: "Receiver",
    notAvailable: "Not available",
    uploadedAt: "Uploaded {date}",
    originalResult: "Original saved result: {status}",
    importRows: "Imported",
    rowErrors: "Row errors",
    file: "File",
    importedAt: "Imported at",
    status: "Status",
    viewErrors: "View row errors ({count})",
    hideErrors: "Hide row errors",
    row: "Row",
    originalMessage: "Original message",
    noImports: "No Excel statements yet",
    noImportsHelp: "Import your first KBZPay Excel statement to begin.",
    search: "Search",
    searchPlaceholder: "Transaction ID or amount",
    available: "Available",
    alreadyUsed: "Already matched",
    noTransactions: "No incoming transactions found",
    noTransactionsHelp:
      "Try another date or search, or update your Excel history.",
    previous: "Previous",
    next: "Next",
    page: "Page {current} of {total}",
    importDone:
      "Excel updated. Added: {added}. Already imported: {skipped}. Row errors: {errors}.",
    importDuplicate:
      "This statement was already imported. Your existing history is ready to use.",
    unexpected: "Something went wrong. Please try again.",
    details: "Details",
    uploadSet: "Receipt upload set",
    loginAgain: "Your session ended. Sign in again to continue.",
    logoutWarning:
      "There are unsent receipts in this page. Sign out and discard those unsent files? Completed results are already saved.",
    localUnavailable:
      "Local receipt reading is not ready. Complete the language-model setup before checking receipts.",
    ocrUnavailable:
      "Receipt reading is unavailable. Check the OCR configuration and try again.",
    queuedReason:
      "This file is ready. Start checking to compare it with your imported Excel history.",
    processingReason:
      "Reading the image and comparing its details with Excel. There is nothing else you need to do.",
    imageDuplicateReason:
      "The same image has already been uploaded. This attempt is a duplicate; the original receipt and its saved result are shown below.",
    "status.VERIFIED": "Match",
    "status.DUPLICATE": "Duplicate",
    "status.UNMATCHED": "Not found",
    "status.FAILED": "Cannot read",
    "status.OCR_UNAVAILABLE": "OCR unavailable",
    "status.QUEUED": "Waiting",
    "status.RECEIVED": "Waiting",
    "status.PENDING_REVIEW": "Not checked",
    "status.OCR_COMPLETED": "Not checked",
    "status.PROCESSING": "Checking",
    "status.REJECTED": "Rejected",
    "status.COMPLETED": "Imported",
    "status.COMPLETED_WITH_ERRORS": "With row errors",
    "status.UPLOADED": "Uploaded",
    "status.PARSING": "Importing",
    "error.EMPTY_FILE":
      "This file is empty. Choose a receipt image with content.",
    "error.FILE_TOO_LARGE":
      "This file is larger than 10 MB. Choose a smaller image.",
    "error.FILE_TYPE": "Choose a PNG, JPEG or WebP receipt image.",
    "error.EXCEL_TYPE":
      "Choose a non-empty KBZPay .xlsx statement up to 10 MB.",
    "error.NETWORK_ERROR":
      "The server could not be reached. Check your connection, then retry this file.",
    "error.INVALID_LOGIN": "The email/phone or password is incorrect.",
    "error.SESSION_EXPIRED":
      "Your session ended. Sign in again. Completed receipts are saved; unsent files need to be selected again.",
    "error.FORBIDDEN": "Your account cannot perform this action.",
    "error.RATE_LIMIT": "Too many requests. Wait a moment and try again.",
    "error.REQUEST_REJECTED":
      "The file or request could not be accepted. Open the details for the reason.",
    "error.CONFLICT":
      "This receipt is already being processed or has a final result. Refresh to see its current result.",
    "error.SERVER_ERROR":
      "The server could not finish this request. Try again shortly.",
    "error.BAD_RESPONSE":
      "The server returned an incomplete response. Retry to recover the saved result.",
    "error.REQUEST_FAILED": "The request did not finish. Please retry.",
    "reason.EXACT_TRANSACTION_ID":
      "The transaction ID and amount agree with an incoming Excel transaction on this receipt’s date.",
    "reason.AMOUNT_DATE_TIME_UNIQUE_CANDIDATE":
      "One incoming Excel transaction agrees with the amount and time. No transaction ID was read, so this is an amount-and-time match.",
    "reason.TRANSACTION_ALREADY_USED":
      "Another receipt already uses this Excel payment. It cannot be counted as a second payment.",
    "reason.TRANSACTION_ID_NOT_FOUND":
      "No incoming Excel transaction has this receipt’s transaction ID for its date. Update the statement or check that this is the correct receipt.",
    "reason.TRANSACTION_ID_AMOUNT_MISMATCH":
      "The transaction ID exists in Excel, but the receipt amount is different.",
    "reason.NO_PROVIDER_SCOPED_CANDIDATE":
      "No incoming Excel history is available for the receipt date. Import the relevant statement, then check again.",
    "reason.NO_LEVEL_TWO_CANDIDATE":
      "No incoming Excel transaction agrees with this receipt’s amount and time.",
    "reason.MULTIPLE_LEVEL_TWO_CANDIDATES":
      "More than one Excel transaction has this amount and time. A unique match could not be determined.",
    "reason.MULTIPLE_EXACT_TRANSACTION_ID_CANDIDATES":
      "More than one transaction has this ID. A unique match could not be determined.",
    "reason.INSUFFICIENT_FIELDS_FOR_LEVEL_TWO":
      "The transaction ID or a usable amount and time could not be read. Try a clearer image.",
    "reason.AWAITING_RECEIPT_DETAILS":
      "This saved receipt has not been checked yet. Choose Check again to read it automatically.",
    "reason.KBZPAY_RECEIPT_REQUIRED":
      "This image could not be identified as a KBZPay receipt. Choose the original receipt image.",
    "reason.OCR_FIELDS_INCOMPLETE":
      "The amount or date could not be read reliably. Try a clearer receipt image.",
    "reason.OCR_FIELDS_NEED_REVIEW":
      "The date could not be read reliably. Try a clearer receipt image.",
    "reason.OCR_NO_TEXT":
      "No readable text was found. Try a clearer receipt image.",
    "reason.OCR_INVALID_IMAGE":
      "This image could not be processed. Choose a valid PNG, JPEG or WebP receipt.",
    "reason.OCR_LOCAL_MODELS_MISSING":
      "Local language models are missing. Complete the local OCR setup, then check again.",
    "reason.OCR_LOCAL_BUSY":
      "Other receipts are being read. Wait a moment and check again.",
    "reason.OCR_LOCAL_FAILED":
      "Local OCR could not process the image. Try a clearer image or check the local OCR setup.",
    "reason.OCR_TIMEOUT":
      "Reading this receipt took too long. Choose Check again to retry.",
    "reason.OCR_FAILED":
      "Receipt reading did not finish. Check the OCR configuration or try again.",
    "reason.COMPARISON_FAILED":
      "The comparison could not finish. The uploaded receipt was saved and can be checked again.",
    "reason.OCR_NOT_CONFIGURED":
      "Receipt reading is not configured. Complete the OCR setup, then check again.",
    "reason.OCR_DRIVER_INVALID":
      "The selected OCR engine is not configured correctly. Check the server configuration.",
    "reason.OCR_BILLING_DISABLED":
      "Google Vision billing is disabled. Enable billing for that project or use local Tesseract OCR.",
    "reason.OCR_API_DISABLED":
      "Cloud Vision API is disabled for the selected project. Enable it or use local Tesseract OCR.",
    "reason.OCR_KEY_INVALID":
      "The OCR service rejected its API key. Check the server configuration.",
    "reason.OCR_ACCESS_DENIED":
      "The OCR service denied access. Check its key restrictions and project permissions.",
    "reason.OCR_QUOTA_EXCEEDED":
      "The OCR service quota has been exceeded. Try later or use local Tesseract OCR.",
    "reason.OCR_NETWORK_ERROR":
      "The server could not reach the OCR service. Check the connection and retry.",
    "reason.HISTORY_LIMIT_EXCEEDED":
      "There is too much history for a reliable comparison. Use a more specific statement.",
    "reason.NO_MATCH":
      "No matching transaction could be found in the imported history.",
  },
  my: {
    workspace: "KBZPay လုပ်ငန်းခွင်",
    signOut: "ထွက်မယ်",
    switchLanguage: "English",
    loginEyebrow: "ငွေလွှဲပြေစာ စစ်ဆေးခြင်း",
    loginTitle: "ပြေစာတိုင်းအတွက်\nရှင်းလင်းတဲ့ အဖြေ။",
    loginIntro:
      "Excel မှတ်တမ်းနဲ့ ပြေစာတွေကို တိုက်စစ်ပါ။ ကိုက်ညီမှု၊ ထပ်တင်ထားမှုနဲ့ မတွေ့တဲ့ ငွေလွှဲတွေကို တစ်နေရာတည်းမှာ သိနိုင်ပါတယ်။",
    loginFeature1: "သင့် Excel ငွေလွှဲမှတ်တမ်းနဲ့ တိုက်စစ်မယ်",
    loginFeature2: "ပြေစာ တစ်ပုံချင်းဖြစ်ဖြစ်၊ ပုံအများဖြစ်ဖြစ် စစ်နိုင်မယ်",
    loginFeature3: "စက်ထဲမှာပဲ ပုံဖတ်မယ်။ Cloud OCR မလိုပါ။",
    welcome: "ပြန်လည်ကြိုဆိုပါတယ်",
    loginHelp: "ပြေစာစစ်ဆေးဖို့ သင့် account နဲ့ ဝင်ပါ။",
    email: "အီးမေးလ် သို့မဟုတ် ဖုန်းနံပါတ်",
    password: "စကားဝှက်",
    signIn: "ဝင်မယ်",
    signingIn: "ဝင်နေပါတယ်…",
    privateWorkspace: "Administrator account နဲ့ ဝင်ရောက်အသုံးပြုပါ။",
    navCheck: "ပြေစာ စစ်ရန်",
    navImports: "Excel မှတ်တမ်း",
    navWallet: "ငွေအဝင် စာရင်း",
    automatic: "အလိုအလျောက် တိုက်စစ်မယ်",
    localPrivate: "စက်ထဲမှာပဲ ပြေစာဖတ်မယ်",
    noApproval: "ပုံတင်ပါ။ စစ်ပါ။ အဖြေကို ကြည့်ပါ။",
    titleCheck: "ပြေစာတွေ စစ်ကြမယ်",
    introCheck:
      "Excel မှတ်တမ်း ထည့်ပြီး ပြေစာ တစ်ပုံချင်း သို့မဟုတ် ပုံအများကို တိုက်စစ်ပါ။",
    titleImports: "သင့် Excel မှတ်တမ်းများ",
    introImports:
      "တင်ထားတဲ့ statement တွေနဲ့ ဝင်လာတဲ့ ငွေလွှဲမှတ်တမ်း၊ row error တွေကို ကြည့်ပါ။",
    titleWallet: "ငွေအဝင် မှတ်တမ်းများ",
    introWallet:
      "Excel ထဲက ငွေလွှဲကို ရှာပြီး ပြေစာတစ်ခုနဲ့ ချိတ်ထားပြီးပြီလား ကြည့်ပါ။",
    historyDate: "မှတ်တမ်းကြည့်မည့်ရက်",
    myanmarTime: "မြန်မာအချိန် · UTC+06:30",
    step1: "01",
    step2: "02",
    excelReady: "Excel မှတ်တမ်း အသင့်ရှိပါပြီ",
    excelMissing: "Excel မှတ်တမ်း အရင်ထည့်ပါ",
    excelMissingHelp:
      "ပြေစာနဲ့ တိုက်စစ်ဖို့ KBZPay က ထုတ်ထားတဲ့ Excel statement ကို ထည့်ပါ။",
    excelMeta: "Statement {count} ဖိုင် · နောက်ဆုံးတင်ချိန် {date}",
    updateExcel: "Excel အသစ်ထည့်မယ်",
    importExcel: "Excel ထည့်မယ်",
    importing: "ထည့်နေပါတယ်…",
    viewImports: "မှတ်တမ်းကြည့်မယ်",
    excelHelp: "KBZPay .xlsx · ရက်အားလုံးပါနိုင်သည် · 10 MB အထိ",
    selectExcel: "Excel statement ရွေးမယ်",
    selectedExcel: "ရွေးထားသည် — {name}",
    requestFailedTitle: "လုပ်ဆောင်မှု မပြီးစီးပါ",
    chooseReceipts: "စစ်မယ့် ပြေစာတွေ ရွေးပါ",
    dropTitle: "ပြေစာပုံတွေ ဒီနေရာမှာ ဆွဲထည့်ပါ",
    dropHelp: "တစ်ပုံ သို့မဟုတ် ပုံအများ · PNG, JPEG, WebP · တစ်ပုံ 10 MB အထိ",
    chooseImages: "ပုံရွေးမယ်",
    dropActive: "ပြေစာတွေ ထည့်ဖို့ လွှတ်လိုက်ပါ",
    selectHint:
      "ရွေးထားတဲ့ပုံတွေကို အောက်ကစာရင်းမှာ ပြပါမယ်။ စစ်ဆေးမယ် နှိပ်မှ ပို့ပါမယ်။",
    selectedFiles: "ဖိုင် {count} ခု ရွေးထားသည်",
    readyFiles: "{count} ပုံ စစ်ရန်အသင့်",
    checkReceipts: "စစ်ဆေးမယ်",
    checkCount: "ပြေစာ {count} ပုံ စစ်ဆေးမယ်",
    resume: "ဆက်စစ်မယ်",
    pause: "ခေတ္တရပ်မယ်",
    pausing: "လက်ရှိပုံ ပြီးရင် ခေတ္တရပ်ပါမယ်…",
    paused: "ခေတ္တရပ်ထားသည် · {total} ပုံမှာ {done} ပုံ စစ်ပြီး",
    checking: "{total} ပုံမှာ {number} ပုံမြောက်ကို စစ်နေသည်",
    finished: "စစ်ပြီးပါပြီ · {total} ပုံမှာ {done} ပုံ စစ်ပြီး",
    readyProgress: "အသင့်ရှိသည် · {count} ပုံ စစ်ရန်",
    batchScope: "ယခုတင်ထားသော ပုံများ · ရက်အားလုံး",
    pageOpen: "ပြေစာစစ်နေစဉ် ဒီစာမျက်နှာကို ဖွင့်ထားပေးပါ။",
    backToBatch: "ပြေစာများသို့",
    refresh: "ပြန်ယူမယ်",
    refreshing: "ပြန်ယူနေသည်…",
    thisBatch: "ယခုတင်ထားသောပုံများ",
    savedReceipts: "သိမ်းပြီးသောပြေစာများ",
    listTitle: "ပြေစာ စာရင်း",
    listCount: "ပြေစာ {count} ပုံ",
    noFiles: "သင့်ပြေစာတွေ ဒီမှာပြပါမယ်",
    noFilesHelp:
      "အပေါ်မှာ ပုံရွေးပြီး စတင်နိုင်ပါတယ်။ တစ်ပုံချင်းဖြစ်ဖြစ် ပုံအများဖြစ်ဖြစ် ရွေးပါ။",
    noSaved: "ဒီရက်အတွက် ပြေစာမရှိသေးပါ",
    noSavedHelp: "အခြားရက်ရွေးပါ သို့မဟုတ် ပြေစာတစ်ပုံ တင်ပါ။",
    noFiltered: "ဒီအုပ်စုထဲမှာ ပြေစာမရှိပါ",
    clearFilter: "အားလုံးပြမယ်",
    all: "အားလုံး",
    matches: "Match",
    duplicates: "Duplicate",
    notFound: "မတွေ့ပါ",
    attention: "ပြန်ကြည့်ရန်",
    pending: "စောင့်နေသည်",
    removeFile: "{name} ကို ဖယ်မယ်",
    fileSize: "{size} MB",
    originalReceipt: "မူရင်း ပြေစာ",
    receipt: "ပြေစာ",
    excel: "Excel မှတ်တမ်း",
    result: "ရလဒ်",
    resultEmpty: "စစ်ဆေးရလဒ်ကို ဒီမှာကြည့်ပါ",
    resultEmptyHelp:
      "ပြေစာတစ်ပုံ ရွေးပြီး ရလဒ်နဲ့ သက်ဆိုင်ရာ Excel အချက်အလက်တွေကို ကြည့်နိုင်ပါတယ်။",
    queuedTitle: "စစ်ဆေးရန် အသင့်ရှိပါပြီ",
    checkingTitle: "ပြေစာဖတ်ပြီး တိုက်စစ်နေသည်…",
    matchTitle: "ဒီပြေစာ ကိုက်ညီပါတယ်",
    duplicateTitle: "ဒီငွေလွှဲကို သုံးပြီးသားဖြစ်ပါတယ်",
    imageDuplicateTitle: "ဒီပုံကို တင်ထားပြီးသားဖြစ်ပါတယ်",
    notFoundTitle: "Excel ထဲမှာ မတွေ့ပါ",
    mismatchTitle: "ငွေပမာဏ မကိုက်ညီပါ",
    uncertainTitle: "ကိုက်ညီမှုကို မသတ်မှတ်နိုင်ပါ",
    readFailedTitle: "ဒီပြေစာကို မဖတ်နိုင်ပါ",
    serviceFailedTitle: "ပြေစာဖတ်စနစ် အဆင်သင့်မဖြစ်သေးပါ",
    fileErrorTitle: "ဒီဖိုင်ကို ပြန်ရွေးပေးပါ",
    rejectedTitle: "ပယ်ချထားသော ပြေစာ",
    notCheckedTitle: "ဒီပြေစာကို မစစ်ရသေးပါ",
    retry: "ပြန်စစ်မယ်",
    retrying: "ပြန်စစ်နေသည်…",
    retryUpload: "ပြန်တင်မယ်",
    cannotRetry: "ဒီရလဒ်ကို အတည်ပြုပြီးဖြစ်ပါတယ်။",
    preview: "ပြေစာပုံ",
    zoom: "ပုံအကြီးကြည့်မယ်",
    close: "ပိတ်မယ်",
    imageLoading: "ပြေစာပုံ ယူနေသည်…",
    imageUnavailable: "ပုံကို မယူနိုင်ပါ။ ပြန်ယူဖို့ ဒီပြေစာကို ထပ်ရွေးပါ။",
    imagePending: "ပြေစာပုံကို ဒီနေရာမှာ ပြပါမယ်။",
    detailsTitle: "တိုက်စစ်ထားသော အချက်အလက်",
    field: "အချက်အလက်",
    transactionId: "Transaction ID",
    amount: "ငွေပမာဏ · MMK",
    receiptDate: "ပြေစာရက်စွဲ",
    time: "အချိန် · မြန်မာ",
    receiver: "လက်ခံသူ",
    notAvailable: "အချက်အလက် မရှိပါ",
    uploadedAt: "တင်ချိန် {date}",
    originalResult: "မူရင်းရလဒ် — {status}",
    importRows: "ထည့်ပြီး",
    rowErrors: "Row error",
    file: "ဖိုင်",
    importedAt: "ထည့်သွင်းချိန်",
    status: "အခြေအနေ",
    viewErrors: "Row error {count} ခု ကြည့်မယ်",
    hideErrors: "Row error ပိတ်မယ်",
    row: "အတန်း",
    originalMessage: "မူရင်းစာသား",
    noImports: "Excel မှတ်တမ်း မရှိသေးပါ",
    noImportsHelp: "စတင်ဖို့ KBZPay Excel statement ကို ထည့်ပါ။",
    search: "ရှာမယ်",
    searchPlaceholder: "Transaction ID သို့မဟုတ် ငွေပမာဏ",
    available: "အသုံးမပြုရသေး",
    alreadyUsed: "ပြေစာနဲ့ ချိတ်ပြီး",
    noTransactions: "ငွေအဝင် မှတ်တမ်း မတွေ့ပါ",
    noTransactionsHelp: "အခြားရက်ရွေးပါ၊ ပြန်ရှာပါ သို့မဟုတ် Excel အသစ်ထည့်ပါ။",
    previous: "ရှေ့သို့",
    next: "နောက်သို့",
    page: "စာမျက်နှာ {current} / {total}",
    importDone:
      "Excel ထည့်ပြီးပါပြီ — {added} ကြောင်း အသစ်ဝင်သည်၊ {skipped} ကြောင်း ရှိပြီးသား၊ Row error {errors} ခု။",
    importDuplicate:
      "ဒီ statement ကို ထည့်ပြီးသားဖြစ်ပါတယ်။ ရှိပြီးသားမှတ်တမ်းနဲ့ စစ်နိုင်ပါတယ်။",
    unexpected: "လုပ်ဆောင်မှု မအောင်မြင်ပါ။ ပြန်လုပ်ကြည့်ပါ။",
    details: "အသေးစိတ်",
    uploadSet: "တင်ထားသော ပြေစာများ",
    loginAgain: "Session ပြီးဆုံးသွားပါပြီ။ ဆက်သုံးဖို့ ပြန်ဝင်ပါ။",
    logoutWarning:
      "မပို့ရသေးတဲ့ ပြေစာတွေ ရှိနေပါတယ်။ အဲဒီဖိုင်တွေကို ဖယ်ပြီး ထွက်မလား? စစ်ပြီးသားရလဒ်တွေကို သိမ်းထားပြီးဖြစ်ပါတယ်။",
    localUnavailable:
      "စက်ထဲမှာ ပြေစာဖတ်ဖို့ အဆင်သင့်မဖြစ်သေးပါ။ Language model setup ကို အရင်ပြီးစီးအောင် လုပ်ပါ။",
    ocrUnavailable:
      "ပြေစာဖတ်စနစ်ကို အသုံးမပြုနိုင်သေးပါ။ OCR setup ကို စစ်ပြီး ပြန်လုပ်ပါ။",
    queuedReason:
      "ဒီဖိုင်ကို စစ်ဖို့အသင့်ဖြစ်ပါပြီ။ Excel မှတ်တမ်းနဲ့ တိုက်စစ်ရန် စစ်ဆေးမယ် ကို နှိပ်ပါ။",
    processingReason:
      "ပုံကို ဖတ်ပြီး Excel မှတ်တမ်းနဲ့ တိုက်စစ်နေပါတယ်။ ထပ်လုပ်စရာမလိုဘဲ ခဏစောင့်ပေးပါ။",
    imageDuplicateReason:
      "တူညီတဲ့ပုံကို တင်ထားပြီးသားဖြစ်ပါတယ်။ ယခု upload က Duplicate ဖြစ်ပြီး အောက်မှာ မူရင်းပြေစာနဲ့ သိမ်းထားတဲ့ရလဒ်ကို ပြထားပါတယ်။",
    "status.VERIFIED": "ကိုက်ညီ · Match",
    "status.DUPLICATE": "ထပ်နေ · Duplicate",
    "status.UNMATCHED": "မတွေ့ · Not found",
    "status.FAILED": "ပုံမဖတ်နိုင်",
    "status.OCR_UNAVAILABLE": "OCR မရသေး",
    "status.QUEUED": "စောင့်နေသည်",
    "status.RECEIVED": "စောင့်နေသည်",
    "status.PENDING_REVIEW": "မစစ်ရသေး",
    "status.OCR_COMPLETED": "မစစ်ရသေး",
    "status.PROCESSING": "စစ်နေသည်",
    "status.REJECTED": "ပယ်ချထားသည်",
    "status.COMPLETED": "ထည့်ပြီး",
    "status.COMPLETED_WITH_ERRORS": "Row error ပါသည်",
    "status.UPLOADED": "တင်ပြီး",
    "status.PARSING": "ထည့်နေသည်",
    "error.EMPTY_FILE":
      "ဒီဖိုင်မှာ အချက်အလက်မပါပါ။ ပြေစာပုံတစ်ပုံကို ပြန်ရွေးပါ။",
    "error.FILE_TOO_LARGE":
      "ဒီဖိုင်က 10 MB ထက် ကြီးနေပါတယ်။ ပိုသေးတဲ့ပုံကို ရွေးပါ။",
    "error.FILE_TYPE": "PNG၊ JPEG သို့မဟုတ် WebP ပြေစာပုံကို ရွေးပါ။",
    "error.EXCEL_TYPE":
      "အချက်အလက်ပါပြီး 10 MB ထက်မကြီးတဲ့ KBZPay .xlsx ဖိုင်ကို ရွေးပါ။",
    "error.NETWORK_ERROR":
      "Server ကို ဆက်သွယ်မရပါ။ Connection ကို စစ်ပြီး ဒီဖိုင်ကို ပြန်တင်ပါ။",
    "error.INVALID_LOGIN": "အီးမေးလ်/ဖုန်းနံပါတ် သို့မဟုတ် စကားဝှက် မမှန်ပါ။",
    "error.SESSION_EXPIRED":
      "Session ပြီးဆုံးသွားပါပြီ။ ပြန်ဝင်ပါ။ စစ်ပြီးသားပြေစာတွေ သိမ်းထားပြီးဖြစ်၍ မပို့ရသေးတဲ့ဖိုင်တွေကို ပြန်ရွေးရန်လိုပါတယ်။",
    "error.FORBIDDEN": "ဒီ account နဲ့ ဒီလုပ်ဆောင်ချက်ကို အသုံးမပြုနိုင်ပါ။",
    "error.RATE_LIMIT": "တောင်းဆိုမှုများနေပါတယ်။ ခဏစောင့်ပြီး ပြန်လုပ်ပါ။",
    "error.REQUEST_REJECTED":
      "ဒီဖိုင် သို့မဟုတ် တောင်းဆိုမှုကို လက်မခံနိုင်ပါ။ အကြောင်းရင်းကို အသေးစိတ်မှာ ကြည့်ပါ။",
    "error.CONFLICT":
      "ဒီပြေစာကို စစ်နေဆဲ သို့မဟုတ် ရလဒ်အတည်ပြုပြီးဖြစ်ပါတယ်။ လက်ရှိရလဒ်ကို ပြန်ယူကြည့်ပါ။",
    "error.SERVER_ERROR":
      "Server က လုပ်ဆောင်မှုကို မပြီးစီးနိုင်ပါ။ ခဏစောင့်ပြီး ပြန်လုပ်ပါ။",
    "error.BAD_RESPONSE":
      "Server က အချက်အလက် အပြည့်အစုံမပေးနိုင်ပါ။ ရလဒ်ပြန်ရဖို့ ပြန်လုပ်ပါ။",
    "error.REQUEST_FAILED": "တောင်းဆိုမှု မပြီးစီးပါ။ ပြန်လုပ်ကြည့်ပါ။",
    "reason.EXACT_TRANSACTION_ID":
      "Transaction ID နဲ့ ငွေပမာဏက ပြေစာရက်စွဲတူတဲ့ Excel ငွေအဝင်တစ်ကြောင်းနဲ့ ကိုက်ညီပါတယ်။",
    "reason.AMOUNT_DATE_TIME_UNIQUE_CANDIDATE":
      "ငွေပမာဏနဲ့ အချိန်တူတဲ့ Excel ငွေအဝင်တစ်ကြောင်း တွေ့ပါတယ်။ Transaction ID မဖတ်ရလို့ ငွေပမာဏနဲ့ အချိန်ကို အခြေခံပြီး ကိုက်ညီခြင်းဖြစ်ပါတယ်။",
    "reason.TRANSACTION_ALREADY_USED":
      "အခြားပြေစာတစ်ပုံက ဒီ Excel ငွေလွှဲကို သုံးထားပြီးဖြစ်ပါတယ်။ နောက်ထပ်ငွေလွှဲတစ်ခုအဖြစ် ထပ်တွက်လို့ မရပါ။",
    "reason.TRANSACTION_ID_NOT_FOUND":
      "ပြေစာရက်စွဲအတွက် ဒီ Transaction ID ပါတဲ့ Excel ငွေအဝင်ကို မတွေ့ပါ။ Statement အသစ်ထည့်ပါ သို့မဟုတ် မှန်ကန်တဲ့ပြေစာလား စစ်ပါ။",
    "reason.TRANSACTION_ID_AMOUNT_MISMATCH":
      "Transaction ID ကို Excel ထဲမှာ တွေ့ပေမယ့် ပြေစာနဲ့ ငွေပမာဏ မကိုက်ညီပါ။",
    "reason.NO_PROVIDER_SCOPED_CANDIDATE":
      "ပြေစာရက်စွဲအတွက် Excel ငွေအဝင်မှတ်တမ်း မရှိသေးပါ။ သက်ဆိုင်ရာ statement ထည့်ပြီး ပြန်စစ်ပါ။",
    "reason.NO_LEVEL_TWO_CANDIDATE":
      "ဒီပြေစာရဲ့ ငွေပမာဏနဲ့ အချိန်ကိုက်ညီတဲ့ Excel ငွေအဝင် မတွေ့ပါ။",
    "reason.MULTIPLE_LEVEL_TWO_CANDIDATES":
      "ငွေပမာဏနဲ့ အချိန်တူတဲ့ Excel ငွေလွှဲ တစ်ကြောင်းထက်ပိုရှိနေလို့ တစ်ခုတည်းကို မသတ်မှတ်နိုင်ပါ။",
    "reason.MULTIPLE_EXACT_TRANSACTION_ID_CANDIDATES":
      "ဒီ Transaction ID ပါတဲ့ မှတ်တမ်း တစ်ခုထက်ပိုနေလို့ တစ်ခုတည်းကို မသတ်မှတ်နိုင်ပါ။",
    "reason.INSUFFICIENT_FIELDS_FOR_LEVEL_TWO":
      "Transaction ID သို့မဟုတ် အသုံးပြုနိုင်တဲ့ ငွေပမာဏနဲ့ အချိန်ကို မဖတ်နိုင်ပါ။ ပိုရှင်းတဲ့ပုံနဲ့ ပြန်စမ်းပါ။",
    "reason.AWAITING_RECEIPT_DETAILS":
      "ဒီပြေစာကို မစစ်ရသေးပါ။ အလိုအလျောက်ဖတ်ဖို့ ပြန်စစ်မယ် ကို နှိပ်ပါ။",
    "reason.KBZPAY_RECEIPT_REQUIRED":
      "ဒီပုံကို KBZPay ပြေစာအဖြစ် မသတ်မှတ်နိုင်ပါ။ မူရင်းပြေစာပုံကို ရွေးပါ။",
    "reason.OCR_FIELDS_INCOMPLETE":
      "ငွေပမာဏ သို့မဟုတ် ရက်စွဲကို သေချာမဖတ်နိုင်ပါ။ ပိုရှင်းတဲ့ပြေစာပုံနဲ့ ပြန်စမ်းပါ။",
    "reason.OCR_FIELDS_NEED_REVIEW":
      "ရက်စွဲကို သေချာမဖတ်နိုင်ပါ။ ပိုရှင်းတဲ့ပြေစာပုံနဲ့ ပြန်စမ်းပါ။",
    "reason.OCR_NO_TEXT":
      "ပုံထဲမှာ ဖတ်နိုင်တဲ့စာသား မတွေ့ပါ။ ပိုရှင်းတဲ့ပြေစာပုံနဲ့ ပြန်စမ်းပါ။",
    "reason.OCR_INVALID_IMAGE":
      "ဒီပုံကို မဖတ်နိုင်ပါ။ မှန်ကန်တဲ့ PNG၊ JPEG သို့မဟုတ် WebP ပြေစာပုံ ရွေးပါ။",
    "reason.OCR_LOCAL_MODELS_MISSING":
      "စက်ထဲမှာ language model မရှိသေးပါ။ Local OCR setup ပြီးအောင်လုပ်ပြီး ပြန်စစ်ပါ။",
    "reason.OCR_LOCAL_BUSY":
      "အခြားပြေစာတွေကို ဖတ်နေပါတယ်။ ခဏစောင့်ပြီး ပြန်စစ်ပါ။",
    "reason.OCR_LOCAL_FAILED":
      "Local OCR က ဒီပုံကို မဖတ်နိုင်ပါ။ ပိုရှင်းတဲ့ပုံနဲ့ ပြန်စမ်းပါ သို့မဟုတ် OCR setup ကို စစ်ပါ။",
    "reason.OCR_TIMEOUT":
      "ဒီပြေစာကို ဖတ်ရာမှာ အချိန်ကြာသွားပါတယ်။ ပြန်စစ်မယ် ကို နှိပ်ပါ။",
    "reason.OCR_FAILED":
      "ပြေစာဖတ်ခြင်း မပြီးစီးပါ။ OCR setup ကို စစ်ပါ သို့မဟုတ် ပြန်စမ်းပါ။",
    "reason.COMPARISON_FAILED":
      "တိုက်စစ်ခြင်း မပြီးစီးပါ။ တင်ထားတဲ့ပြေစာကို သိမ်းထားပြီးဖြစ်လို့ ပြန်စစ်နိုင်ပါတယ်။",
    "reason.OCR_NOT_CONFIGURED":
      "ပြေစာဖတ်စနစ်ကို မပြင်ဆင်ရသေးပါ။ OCR setup ပြီးအောင်လုပ်ပြီး ပြန်စစ်ပါ။",
    "reason.OCR_DRIVER_INVALID":
      "ရွေးထားတဲ့ OCR engine ကို မပြင်ဆင်ထားပါ။ Server configuration ကို စစ်ပါ။",
    "reason.OCR_BILLING_DISABLED":
      "Google Vision billing မဖွင့်ထားပါ။ အဲဒီ project ရဲ့ billing ကိုဖွင့်ပါ သို့မဟုတ် local Tesseract သုံးပါ။",
    "reason.OCR_API_DISABLED":
      "ရွေးထားတဲ့ project မှာ Cloud Vision API မဖွင့်ထားပါ။ API ဖွင့်ပါ သို့မဟုတ် local Tesseract သုံးပါ။",
    "reason.OCR_KEY_INVALID":
      "OCR service က API key ကို လက်မခံပါ။ Server configuration ကို စစ်ပါ။",
    "reason.OCR_ACCESS_DENIED":
      "OCR service ကို အသုံးပြုခွင့် မရှိပါ။ Key restrictions နဲ့ project permissions ကို စစ်ပါ။",
    "reason.OCR_QUOTA_EXCEEDED":
      "OCR service အသုံးပြုခွင့် ပမာဏကျော်နေပါတယ်။ နောက်မှပြန်စမ်းပါ သို့မဟုတ် local Tesseract သုံးပါ။",
    "reason.OCR_NETWORK_ERROR":
      "Server က OCR service ကို ဆက်သွယ်မရပါ။ Connection ကို စစ်ပြီး ပြန်စမ်းပါ။",
    "reason.HISTORY_LIMIT_EXCEEDED":
      "မှတ်တမ်းများလွန်းလို့ သေချာမတိုက်စစ်နိုင်ပါ။ ရက်အပိုင်းအခြား ပိုကျဉ်းတဲ့ statement သုံးပါ။",
    "reason.NO_MATCH": "တင်ထားတဲ့မှတ်တမ်းထဲမှာ ကိုက်ညီတဲ့ ငွေလွှဲ မတွေ့ပါ။",
  },
};

const extra: Record<Locale, Record<string, string>> = {
  en: {
    "error.REQUIRED": "This field is required.",
    "error.TOO_LONG": "This value is too long.",
    "error.SELECT_EXCEL": "Choose an Excel statement.",
    secure: "Private payment workspace",
    overview: "WORKSPACE",
    workflow: "Compare with confidence",
    matchDisclaimer:
      "A match confirms agreement with imported Excel history. It is not live bank confirmation.",
  },
  my: {
    "error.REQUIRED": "ဤအကွက်ကို ဖြည့်ပါ။",
    "error.TOO_LONG": "ဖြည့်ထားသော စာသား ရှည်လွန်းနေပါတယ်။",
    "error.SELECT_EXCEL": "Excel မှတ်တမ်း ရွေးပါ။",
    secure: "သီးသန့် ငွေလွှဲစစ်ဆေးရေး",
    overview: "လုပ်ငန်းခွင်",
    workflow: "ရှင်းရှင်းလင်းလင်း တိုက်စစ်မယ်",
    matchDisclaimer:
      "Match ဆိုသည်မှာ တင်ထားသည့် Excel မှတ်တမ်းနှင့် ကိုက်ညီခြင်းဖြစ်ပြီး ဘဏ်မှ တိုက်ရိုက်အတည်ပြုခြင်း မဟုတ်ပါ။",
  },
};
Object.assign(messages.en, extra.en);
Object.assign(messages.my, extra.my);
Object.assign(messages.en, authMessages.en);
Object.assign(messages.my, authMessages.my);

export function translate(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const template =
    messages[locale][key] ?? messages.en[key] ?? messages[locale].unexpected;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? ""),
  );
}
