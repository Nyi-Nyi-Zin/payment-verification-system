import {
  BatchStatus,
  ScreenshotStatus,
} from '@prisma/client';

const SCREENSHOT_TRANSITIONS: Record<ScreenshotStatus, readonly ScreenshotStatus[]> = {
  RECEIVED: ['PROCESSING', 'REJECTED'],
  PROCESSING: ['OCR_COMPLETED', 'FAILED'],
  OCR_COMPLETED: ['PENDING_REVIEW', 'VERIFIED', 'UNMATCHED', 'FAILED'],
  PENDING_REVIEW: ['VERIFIED', 'DUPLICATE', 'UNMATCHED', 'REJECTED', 'PROCESSING'],
  VERIFIED: [],
  DUPLICATE: [],
  UNMATCHED: ['PENDING_REVIEW', 'REJECTED'],
  FAILED: ['PROCESSING', 'REJECTED'],
  REJECTED: [],
};

const BATCH_TRANSITIONS: Record<BatchStatus, readonly BatchStatus[]> = {
  CREATED: ['RUNNING', 'FAILED'],
  RUNNING: ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'],
  COMPLETED: [],
  COMPLETED_WITH_ERRORS: ['RUNNING'],
  FAILED: ['RUNNING'],
};

export class StatusTransitionService {
  canMoveScreenshot(from: ScreenshotStatus, to: ScreenshotStatus): boolean {
    return SCREENSHOT_TRANSITIONS[from].includes(to);
  }

  assertScreenshotTransition(
    from: ScreenshotStatus,
    to: ScreenshotStatus,
  ): void {
    if (!this.canMoveScreenshot(from, to)) {
      throw new Error(`Invalid screenshot transition: ${from} -> ${to}`);
    }
  }

  canMoveBatch(from: BatchStatus, to: BatchStatus): boolean {
    return BATCH_TRANSITIONS[from].includes(to);
  }

  assertBatchTransition(from: BatchStatus, to: BatchStatus): void {
    if (!this.canMoveBatch(from, to)) {
      throw new Error(`Invalid batch transition: ${from} -> ${to}`);
    }
  }
}
