import { validateReceipt } from "./schemas";
import { ApiError } from "./api";
import type { CheckResult, Status } from "./types";
export { MAX_FILE_BYTES, validateReceipt } from "./schemas";
export interface QueueItem {
  id: string;
  name: string;
  size: number;
  file: File | null;
  phase: "queued" | "uploading" | "invalid" | "done" | "error";
  errorCode: string | null;
  errorDetails?: string | null;
  result: CheckResult | null;
}
interface QueueOptions {
  upload: (file: File) => Promise<CheckResult>;
  recheck: (id: string) => Promise<CheckResult>;
  onChange?: (queue: ReceiptQueue) => void;
}
export function outcome(item: QueueItem): Status {
  if (item.phase === "queued") return "QUEUED";
  if (item.phase === "uploading") return "PROCESSING";
  if (item.phase === "error" || item.phase === "invalid") return "FAILED";
  return item.result?.duplicate ? "DUPLICATE" : item.result?.status || "FAILED";
}

export function retryable(item: QueueItem) {
  return (
    !["queued", "invalid", "uploading"].includes(item.phase) &&
    (!item.result?.duplicate || item.result?.status === "DUPLICATE") &&
    !["VERIFIED", "REJECTED"].includes(item.result?.status || "")
  );
}

/** A page-local queue. One request at a time also protects the local OCR worker. */
export class ReceiptQueue {
  upload: QueueOptions["upload"];
  recheck: QueueOptions["recheck"];
  onChange: NonNullable<QueueOptions["onChange"]>;
  items: QueueItem[];
  running: boolean;
  paused: boolean;
  pauseRequested: boolean;
  abandoned: boolean;
  nextId: number;
  version = 0;
  follow = true;
  setFollow(value: boolean) {
    this.follow = value;
  }
  activate() {
    this.abandoned = false;
  }
  listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.version;
  getServerSnapshot = () => 0;
  constructor({ upload, recheck, onChange = () => {} }: QueueOptions) {
    this.upload = upload;
    this.recheck = recheck;
    this.onChange = onChange;
    this.items = [];
    this.running = false;
    this.paused = false;
    this.pauseRequested = false;
    this.abandoned = false;
    this.nextId = 0;
  }

  add(files: Iterable<File>) {
    if (this.running || this.abandoned) return;
    for (const file of files) {
      const errorCode = validateReceipt(file);
      this.items.push({
        id: `upload-${++this.nextId}`,
        name: file.name,
        size: file.size,
        file,
        phase: errorCode ? "invalid" : "queued",
        errorCode,
        result: null,
      });
    }
    this.notify();
  }

  remove(id: string) {
    if (this.running) return;
    this.items = this.items.filter(
      (item) => item.id !== id || !["queued", "invalid"].includes(item.phase),
    );
    this.notify();
  }

  discardScreenshot(id: string) {
    if (this.running) return;
    this.items = this.items.filter((item) => item.result?.screenshotId !== id);
    this.notify();
  }

  get pending() {
    return this.items.filter((item) => item.phase === "queued").length;
  }
  get hasUnfinished() {
    return (
      !this.abandoned &&
      this.items.some((item) => ["queued", "uploading"].includes(item.phase))
    );
  }
  get progress() {
    const accepted = this.items.filter((item) => item.phase !== "invalid");
    return {
      total: accepted.length,
      done: accepted.filter((item) => ["done", "error"].includes(item.phase))
        .length,
    };
  }

  notify() {
    if (!this.abandoned) {
      this.version++;
      this.listeners.forEach((listener) => listener());
      this.onChange(this);
    }
  }

  pause() {
    if (!this.running) return;
    this.pauseRequested = true;
    this.notify();
  }

  async run() {
    if (this.running || this.abandoned || !this.pending) return;
    this.running = true;
    this.paused = this.pauseRequested = false;
    this.notify();
    try {
      while (!this.pauseRequested && !this.abandoned) {
        const item = this.items.find((entry) => entry.phase === "queued");
        if (!item) break;
        await this.process(item, false);
      }
    } finally {
      this.running = false;
      this.paused = this.pending > 0;
      this.notify();
    }
  }

  async retry(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item || this.running || this.abandoned || !retryable(item)) return;
    this.running = true;
    this.pauseRequested = false;
    this.notify();
    try {
      await this.process(item, true);
    } finally {
      this.running = false;
      this.paused = this.pending > 0;
      this.notify();
    }
  }

  async process(item: QueueItem, retry: boolean) {
    item.phase = "uploading";
    item.errorCode = null;
    item.errorDetails = null;
    this.notify();
    try {
      const result =
        retry && item.result?.screenshotId
          ? await this.recheck(item.result.screenshotId)
          : await this.upload(item.file!);
      if (!result?.screenshotId || !result.status)
        throw Object.assign(new Error(), { code: "BAD_RESPONSE" });
      item.result = result;
      item.phase = "done";
      item.file = null;
    } catch (cause) {
      const error =
        cause instanceof ApiError
          ? cause
          : Object.assign(new Error(), {
              code: (cause as { code?: string })?.code || "REQUEST_FAILED",
              details: null,
            });
      item.phase = "error";
      item.errorCode = error.code || "REQUEST_FAILED";
      item.errorDetails = error.details || null;
      if (error.code === "SESSION_EXPIRED") this.pauseRequested = true;
    }
    this.notify();
  }

  abandon() {
    this.abandoned = this.pauseRequested = true;
    for (const item of this.items) item.file = null;
  }
}
