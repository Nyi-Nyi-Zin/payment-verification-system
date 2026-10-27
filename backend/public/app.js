"use strict";
const $ = (selector) => document.querySelector(selector);
const state = {
  token: null,
  refreshToken: null,
  user: null,
  view: "review",
  receipts: [],
  selected: null,
  detail: null,
  imageUrl: null,
  receiptPage: 1,
  importPage: 1,
  historyPage: 1,
  receiptTotal: 0,
  importTotal: 0,
  historyTotal: 0,
  candidatePage: 1,
  candidateTotal: 0,
  candidates: [],
  candidateSearch: "",
  chosen: null,
  loadVersion: 0,
  detailVersion: 0,
};
const money = (value) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const stamp = (date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const canUpload = () => ["ADMIN", "OPERATOR"].includes(state.user?.role);
const canReview = () => ["ADMIN", "REVIEWER"].includes(state.user?.role);
const terminal = (status) =>
  ["VERIFIED", "DUPLICATE", "REJECTED"].includes(status);
const statusName = (status) =>
  ({
    VERIFIED: "Approved",
    PENDING_REVIEW: "Awaiting review",
    DUPLICATE: "Duplicate",
    REJECTED: "Rejected",
    RECEIVED: "Received",
    FAILED: "Failed",
    PROCESSING: "Processing",
    COMPLETED: "Completed",
    COMPLETED_WITH_ERRORS: "With errors",
  })[status] || status;
const badge = (status) =>
  `<span class="badge ${status === "VERIFIED" || status === "COMPLETED" ? "success" : status === "PENDING_REVIEW" || status === "COMPLETED_WITH_ERRORS" ? "pending" : ["REJECTED", "FAILED", "DUPLICATE"].includes(status) ? "danger" : "neutral"}">${esc(statusName(status))}</span>`;
const dateQuery = () => `date=${encodeURIComponent($("#business-date").value)}`;
const reasonText = (code) =>
  ({
    AWAITING_RECEIPT_DETAILS:
      "Read the receipt with OCR or enter its details below.",
    OCR_NOT_CONFIGURED_ENTER_DETAILS:
      "OCR is unavailable. Enter the details shown on the receipt to find a match.",
    OCR_FAILED_ENTER_DETAILS:
      "The receipt could not be read. Enter the details shown on the receipt.",
    EXACT_TRANSACTION_ID:
      "Transaction ID and amount match the imported history. Compare the receipt before approving.",
    AMOUNT_DATE_TIME_UNIQUE_CANDIDATE:
      "One incoming transaction matches the amount and time. Compare its details before approving.",
    TRANSACTION_ALREADY_USED:
      "This payment is already linked to another receipt. It cannot be approved again.",
    TRANSACTION_ID_NOT_FOUND:
      "This transaction ID was not found in the imported history. Check the ID and business date.",
    TRANSACTION_ID_AMOUNT_MISMATCH:
      "The transaction ID exists, but the amount differs. Check the receipt.",
    MULTIPLE_LEVEL_TWO_CANDIDATES:
      "More than one transaction matches. Compare the transaction IDs carefully.",
    NO_PROVIDER_SCOPED_CANDIDATE:
      "No incoming transactions are available for this date. Import wallet history first.",
    INSUFFICIENT_FIELDS_FOR_LEVEL_TWO:
      "Enter the transaction ID, or the amount and time, to find a candidate.",
    NO_LEVEL_TWO_CANDIDATE:
      "No transaction matches the amount and time. Check the details or search the history.",
    KBZPAY_RECEIPT_REQUIRED:
      "The image could not be identified as a KBZPay receipt. Check it and enter the details.",
  })[code] || "Compare the receipt with the imported wallet history.";

function notice(message, error = false) {
  const node = $("#notice");
  node.hidden = !message;
  node.textContent = message;
  node.classList.toggle("error", error);
}
async function api(path, options = {}, retried = false) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/v1${path}`, { ...options, headers });
  if (
    response.status === 401 &&
    state.refreshToken &&
    !retried &&
    !path.startsWith("/auth/")
  ) {
    const refresh = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    if (refresh.ok) {
      const tokens = await refresh.json();
      state.token = tokens.accessToken;
      state.refreshToken = tokens.refreshToken;
      return api(path, options, true);
    }
    clearSession();
    throw new Error("Your session expired. Please sign in again.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = Array.isArray(data.message)
      ? data.message.join(". ")
      : data.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (options.image) return response.blob();
  return response.json();
}
async function busy(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await task();
  } catch (error) {
    notice(error.message || "Something went wrong. Please try again.", true);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}
function clearSession() {
  state.token = state.refreshToken = state.user = null;
  state.selected = state.detail = null;
  state.loadVersion++;
  state.detailVersion++;
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.imageUrl = null;
  $("#workspace").hidden = true;
  $("#login-view").hidden = false;
  $("#login-form").reset();
}
function resetDetail() {
  state.selected = state.detail = null;
  state.detailVersion++;
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.imageUrl = null;
  $("#review-detail").innerHTML =
    '<div class="empty-state"><span class="empty-icon">▤</span><h2>Make each payment count</h2><p>Select a receipt to compare it with your wallet history.</p></div>';
}
function pageState(prefix, page, total, size = 50) {
  $(`#${prefix}-page`).textContent = total
    ? `${page} / ${Math.ceil(total / size)}`
    : "No records";
  const key = prefix === "receipts" ? "receipts" : prefix;
  $(`[data-page="${key}-prev"]`).disabled = page <= 1;
  $(`[data-page="${key}-next"]`).disabled = page * size >= total;
}
async function reload() {
  const version = ++state.loadVersion;
  const [overview, receipts, imports, history] = await Promise.all([
    api(`/dashboard?${dateQuery()}`),
    api(
      `/screenshots?${dateQuery()}&page=${state.receiptPage}&status=${$("#status-filter").value}`,
    ),
    api(`/imports?${dateQuery()}&page=${state.importPage}`),
    api(
      `/transactions?${dateQuery()}&page=${state.historyPage}&search=${encodeURIComponent($("#history-search").value)}`,
    ),
  ]);
  if (version !== state.loadVersion || !state.token) return;
  $("#stat-transactions").textContent = money(overview.transactions);
  $("#stat-pending").textContent = money(
    (overview.receipts.PENDING_REVIEW || 0) + (overview.receipts.RECEIVED || 0),
  );
  $("#stat-verified").textContent = money(overview.receipts.VERIFIED);
  $("#stat-duplicates").textContent = money(overview.receipts.DUPLICATE);
  state.receipts = receipts.items;
  state.receiptTotal = receipts.total;
  state.importTotal = imports.total;
  state.historyTotal = history.total;
  renderReceipts();
  pageState("receipts", state.receiptPage, receipts.total);
  $("#imports-table").innerHTML = imports.items.length
    ? imports.items
        .map(
          (i) =>
            `<tr><td>${esc(i.fileName)}</td><td>${badge(i.status)}</td><td>${money(i.parsedRows)}</td><td>${i.errorRows ? `<button class="text-button" data-errors="${esc(i.id)}">${i.errorRows} · View</button>` : "—"}</td><td><small>${stamp(i.createdAt)}</small></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="blank-list">No imports for this date. Import a KBZPay Excel export to get started.</td></tr>';
  pageState("imports", state.importPage, imports.total);
  $("#transactions-table").innerHTML = history.items.length
    ? history.items
        .map(
          (t) =>
            `<tr><td>${esc(t.externalTransactionId || "No reference")}</td><td><strong>${money(t.amount)}</strong> <small>MMK</small></td><td><small>${stamp(t.transactionAtUtc)}</small></td><td><span class="badge ${t.usedTransaction ? "neutral" : "success"}">${t.usedTransaction ? "Already used" : "Available"}</span></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="blank-list">No incoming transactions found. Check your import, search and business date.</td></tr>';
  pageState("history", state.historyPage, history.total);
}
function renderReceipts() {
  const filter = $("#status-filter").value;
  const rows = state.receipts.filter(
    (r) => filter === "ALL" || r.status === filter,
  );
  $("#queue-count").textContent =
    `${state.receiptTotal} receipt${state.receiptTotal === 1 ? "" : "s"} for this date`;
  $("#receipt-list").innerHTML = rows.length
    ? rows
        .map((r) => {
          const ocr = r.ocrResults[0];
          return `<button class="receipt-row ${state.selected === r.id ? "selected" : ""}" data-receipt="${esc(r.id)}" aria-pressed="${state.selected === r.id}"><span class="row-top"><strong>${ocr?.extractedAmount ? money(ocr.extractedAmount) + " MMK" : "Receipt " + esc(r.id.slice(0, 6))}</strong>${badge(r.status)}</span><span class="row-sub"><span>${esc(ocr?.extractedTransactionId || "Details needed")}</span><span>${stamp(r.receivedAt)}</span></span></button>`;
        })
        .join("")
    : '<div class="blank-list">No receipts to show on this page.<br>Add a receipt or change the date or status filter.</div>';
}
async function openReceipt(id) {
  const version = ++state.detailVersion;
  state.selected = id;
  state.chosen = null;
  state.candidatePage = 1;
  state.candidateSearch = "";
  renderReceipts();
  $("#review-detail").innerHTML =
    '<div class="empty-state"><p>Loading receipt…</p></div>';
  const detail = await api(`/screenshots/${id}`);
  if (version !== state.detailVersion) return;
  state.detail = detail;
  const fields = detail.ocrResults[0] || {};
  const result = detail.verificationResults[0];
  const resolved = terminal(detail.status);
  $("#review-detail").innerHTML =
    `<div class="detail-header"><div><h2>Receipt ${esc(id.slice(0, 8))}</h2><p>${esc(detail.source)} · ${stamp(detail.receivedAt)}</p></div>${badge(detail.status)}</div><div class="detail-body"><div class="receipt-preview"><p id="image-loading">Loading screenshot…</p><img id="receipt-image" alt="Payment receipt being reviewed" hidden><a id="image-link" class="preview-link" target="_blank" rel="noopener" hidden>Open full size ↗</a></div><div class="detail-forms">${resolved ? `<div class="match-note">${esc(statusName(detail.status))}${result?.reviewedAt ? " on " + stamp(result.reviewedAt) : ""}.${result?.transaction?.externalTransactionId ? " Transaction: " + esc(result.transaction.externalTransactionId) : ""}${result?.reviewComment ? "<br>Review note: " + esc(result.reviewComment) : ""}</div>` : `<div class="detail-section-title"><h3>Receipt details</h3><button id="run-ocr" class="text-button" ${detail.status === "PROCESSING" ? "disabled" : ""}>↻ Read with OCR</button></div><p class="help-text">Compare these fields with the image. OCR suggestions and entered details always require human approval.</p><form id="details-form"><div class="form-grid"><label>Amount · MMK<input name="amount" inputmode="decimal" required pattern="[0-9]+(\\.[0-9]{1,2})?" value="${esc(fields.extractedAmount || "")}"></label><label>Transaction ID<input name="transactionId" maxlength="100" value="${esc(fields.extractedTransactionId || "")}" placeholder="From the receipt"></label><label>Receipt date<input name="date" type="date" required value="${esc(fields.extractedDate?.slice(0, 10) || detail.businessDate?.slice(0, 10) || $("#business-date").value)}"></label><label>Time · Myanmar<input name="time" type="time" value="${esc(toTimeInput(fields.extractedTime))}"></label><label class="wide">Receiver name (optional)<input name="receiver" maxlength="200" value="${esc(fields.extractedReceiver || "")}"></label></div><div class="details-actions"><small class="muted">${fields.ocrEngine === "manual-entry" ? "Details entered by an operator" : fields.ocrEngine ? "OCR suggestions · please check" : "Enter the details on the receipt"}</small><button class="secondary" type="submit">Find match</button></div></form><div class="match-note">${esc(reasonText(result?.reasonCode))}</div><div class="detail-section-title"><h3>Compare wallet history</h3><span class="badge neutral">Incoming only</span></div><form id="candidate-search-form" class="inline-search"><input id="candidate-search" aria-label="Search candidate transactions" placeholder="Transaction ID or amount"><button class="secondary">Search</button></form><div id="candidate-list" class="candidate-list"></div><div class="pagination"><button id="candidates-prev" class="text-button">← Previous</button><span id="candidates-page"></span><button id="candidates-next" class="text-button">Next →</button></div>${canReview() ? `<div class="review-actions"><label>Review note<textarea id="review-comment" rows="2" maxlength="1000" placeholder="Required if you select a different transaction"></textarea></label><label class="confirm-label"><input id="review-confirm" type="checkbox">I compared this receipt with incoming wallet history and checked the amount, date and receiver.</label><div class="action-row"><button id="approve" class="primary">Approve payment</button><button id="duplicate" class="secondary">Mark duplicate</button><button id="reject" class="secondary danger">Reject receipt</button></div></div>` : '<p class="help-text">An administrator or reviewer can approve this receipt.</p>'}`}</div></div>`;
  const image = await api(`/screenshots/${id}/image`, { image: true }).catch(
    () => null,
  );
  if (version !== state.detailVersion) return;
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  if (image) {
    state.imageUrl = URL.createObjectURL(image);
    $("#receipt-image").src = state.imageUrl;
    $("#receipt-image").hidden = false;
    $("#image-link").href = state.imageUrl;
    $("#image-link").hidden = false;
    $("#image-loading").hidden = true;
  } else {
    $("#image-loading").textContent =
      "Screenshot unavailable. Refresh to try again.";
  }
  if (resolved) return;
  state.chosen = result?.transactionId || null;
  state.candidateSearch =
    result?.transaction?.externalTransactionId ||
    fields.extractedTransactionId ||
    fields.extractedAmount ||
    "";
  $("#candidate-search").value = state.candidateSearch;
  await loadCandidates(version);
}
function toTimeInput(value) {
  if (!value) return "";
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}
async function loadCandidates(version = state.detailVersion) {
  const date =
    state.detail.businessDate?.slice(0, 10) || $("#business-date").value;
  const result = await api(
    `/transactions?date=${date}&page=${state.candidatePage}&search=${encodeURIComponent(state.candidateSearch)}`,
  );
  if (version !== state.detailVersion || !$("#candidate-list")) return;
  state.candidates = result.items;
  state.candidateTotal = result.total;
  if (!result.items.some((t) => t.id === state.chosen)) state.chosen = null;
  $("#candidate-list").innerHTML = result.items.length
    ? result.items
        .map(
          (t) =>
            `<label class="candidate"><input type="radio" name="candidate" value="${esc(t.id)}" ${state.chosen === t.id ? "checked" : ""}><span><strong>${esc(t.externalTransactionId || "No transaction reference")}</strong><small>${stamp(t.transactionAtUtc)} · ${t.usedTransaction ? "Already linked to a receipt" : "Available"}</small></span><b>${money(t.amount)} <small>MMK</small></b></label>`,
        )
        .join("")
    : '<p class="help-text">No matching history found. Clear the search to see incoming transactions, or import the correct business date.</p>';
  $("#candidates-page").textContent = result.total
    ? `${state.candidatePage} / ${Math.ceil(result.total / 50)}`
    : "No transactions";
  $("#candidates-prev").disabled = state.candidatePage <= 1;
  $("#candidates-next").disabled = state.candidatePage * 50 >= result.total;
}
async function resolveReceipt(action) {
  const comment = $("#review-comment").value.trim();
  if (action !== "REJECT" && !state.chosen)
    throw new Error("Select the corresponding transaction first.");
  if (action === "APPROVE" && !$("#review-confirm").checked)
    throw new Error(
      "Confirm that you compared the receipt with wallet history before approving.",
    );
  const body = {
    action,
    confirmed: $("#review-confirm").checked,
    ...(action !== "REJECT" ? { transactionId: state.chosen } : {}),
    ...(comment ? { comment } : {}),
  };
  const id = state.selected;
  await api(`/reviews/${id}/resolve`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  notice(
    action === "APPROVE"
      ? "Payment approved. This transaction is now reserved for this receipt."
      : action === "MARK_DUPLICATE"
        ? "Receipt marked as a duplicate."
        : "Receipt rejected.",
  );
  await reload();
  await openReceipt(id);
}

$("#business-date").value = today();
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    const fields = new FormData(event.target);
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(fields)),
    });
    state.token = result.accessToken;
    state.refreshToken = result.refreshToken;
    state.user = result.user;
    $("#account-name").textContent =
      `${result.user.emailOrPhone} · ${result.user.role.toLowerCase()}`;
    $("#login-view").hidden = true;
    $("#workspace").hidden = false;
    $("#upload-panel").hidden = !canUpload();
    $("#login-form").reset();
    resetDetail();
    await reload();
  } catch (error) {
    if (state.token) notice(error.message, true);
    else $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$("#logout").addEventListener("click", () =>
  busy($("#logout"), async () => {
    await api("/auth/logout", { method: "POST" });
    clearSession();
  }),
);
$("#business-date").addEventListener("change", () => {
  state.receiptPage = state.importPage = state.historyPage = 1;
  resetDetail();
  notice("");
  reload().catch((e) => notice(e.message, true));
});
$("#status-filter").addEventListener("change", () => {
  state.receiptPage = 1;
  reload().catch((e) => notice(e.message, true));
});
$("#refresh").addEventListener("click", (event) =>
  busy(event.currentTarget, async () => {
    await reload();
    if (state.selected) await openReceipt(state.selected);
  }),
);
for (const kind of ["import", "receipt"]) {
  $(`#${kind}-form`).addEventListener("submit", (event) => {
    event.preventDefault();
    busy(event.submitter, async () => {
      const form = new FormData(event.target);
      const file = form.get("file");
      if (!file?.size || file.size > 10 * 1024 * 1024)
        throw new Error("Choose a non-empty file up to 10 MB.");
      form.set("provider", "KBZPAY");
      form.set("businessDate", $("#business-date").value);
      const result = await api(
        kind === "import" ? "/imports" : "/screenshots",
        { method: "POST", body: form },
      );
      notice(
        result.duplicate
          ? "This file was already added. Showing the existing record."
          : kind === "import"
            ? `${result.parsedRows} transactions added. ${result.skippedRows || 0} already imported. ${result.errorRows} row errors.`
            : "Receipt added. Read it with OCR or enter its details to find a match.",
      );
      event.target.reset();
      state.receiptPage = state.importPage = 1;
      await reload();
      if (kind === "receipt") await openReceipt(result.screenshotId);
    });
  });
}
$("#history-search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.historyPage = 1;
  busy(event.submitter, reload);
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "details-form") {
    event.preventDefault();
    const form = event.target;
    busy(event.submitter, async () => {
      const details = Object.fromEntries(
        [...new FormData(form)].filter(([, value]) => value !== ""),
      );
      const id = state.selected;
      await api(`/screenshots/${id}/details`, {
        method: "POST",
        body: JSON.stringify(details),
      });
      notice(
        "Receipt details saved. Compare the suggested transaction before approving.",
      );
      await reload();
      await openReceipt(id);
    });
  }
  if (event.target.id === "candidate-search-form") {
    event.preventDefault();
    state.candidateSearch = $("#candidate-search").value;
    state.candidatePage = 1;
    state.chosen = null;
    busy(event.submitter, () => loadCandidates());
  }
});
document.addEventListener("change", (event) => {
  if (event.target.name === "candidate") state.chosen = event.target.value;
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) {
    state.view = button.dataset.view;
    document
      .querySelectorAll("[data-view]")
      .forEach((node) => node.classList.toggle("active", node === button));
    ["review", "imports", "transactions"].forEach(
      (view) => ($(`#${view}-view`).hidden = view !== state.view),
    );
    const title = {
      review: "Receipt review",
      imports: "Import history",
      transactions: "Wallet history",
    }[state.view];
    $("#page-title").textContent = $("#breadcrumb-title").textContent = title;
    return;
  }
  if (button.dataset.receipt) {
    busy(button, () => openReceipt(button.dataset.receipt));
    return;
  }
  if (button.dataset.page) {
    const [kind, direction] = button.dataset.page.split("-");
    const key = {
      receipts: "receiptPage",
      imports: "importPage",
      history: "historyPage",
    }[kind];
    const previous = state[key];
    state[key] += direction === "next" ? 1 : -1;
    busy(button, async () => {
      try {
        await reload();
      } catch (error) {
        state[key] = previous;
        throw error;
      }
    });
    return;
  }
  if (button.dataset.errors) {
    busy(button, async () => {
      const errors = await api(`/imports/${button.dataset.errors}/errors`);
      $("#import-errors").textContent = errors
        .map((e) => `Row ${e.sourceRowNumber}: ${e.errorMessage}`)
        .join("\n");
      $("#import-errors").hidden = false;
    });
    return;
  }
  if (button.id === "run-ocr")
    busy(button, async () => {
      const id = state.selected;
      const result = await api(`/verification/screenshots/${id}/process`, {
        method: "POST",
      });
      notice(reasonText(result.reasonCode));
      await reload();
      await openReceipt(id);
    });
  if (["approve", "duplicate", "reject"].includes(button.id))
    busy(button, () =>
      resolveReceipt(
        { approve: "APPROVE", duplicate: "MARK_DUPLICATE", reject: "REJECT" }[
          button.id
        ],
      ),
    );
  if (button.id === "candidates-prev" || button.id === "candidates-next") {
    state.candidatePage += button.id.endsWith("next") ? 1 : -1;
    busy(button, () => loadCandidates());
  }
});
