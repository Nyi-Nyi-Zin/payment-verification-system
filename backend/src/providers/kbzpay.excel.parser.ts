import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { ProviderCode } from '../common/enums/domain.enums';
import {
  CanonicalTransaction,
  ParseError,
  ParserResult,
  ProviderImportParser,
  TransactionDirection,
} from './provider.contracts';

const TIMEZONE = 'Asia/Yangon';
const PARSER_VERSION = 'kbzpay-xlsx-1.0.0';

export class KbzpayExcelParser implements ProviderImportParser {
  readonly provider = ProviderCode.KBZPAY;
  readonly version = PARSER_VERSION;

  async parse(
    input: Buffer,
    _fileName: string,
    businessDate: string,
  ): Promise<ParserResult> {
    const workbook = XLSX.read(input, { type: 'buffer', cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return {
        provider: this.provider,
        parserVersion: this.version,
        totalRows: 0,
        transactions: [],
        errors: [this.error(0, 'EMPTY_WORKBOOK', 'No worksheet was found')],
      };
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: null,
    });
    const headerIndex = this.findHeaderIndex(rows);
    if (headerIndex < 0) {
      return {
        provider: this.provider,
        parserVersion: this.version,
        totalRows: 0,
        transactions: [],
        errors: [
          this.error(
            0,
            'HEADER_NOT_FOUND',
            'KBZPay transaction header row was not found',
          ),
        ],
      };
    }

    const headers = rows[headerIndex].map((value) => this.normalize(value));
    const transactions: CanonicalTransaction[] = [];
    const errors: ParseError[] = [];

    for (let index = headerIndex + 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.every((value) => value === null || value === '')) {
        continue;
      }

      const record = this.toRecord(headers, row);
      const description = this.text(record['detaileddescription']);
      if (description.toLowerCase().includes('opening balance')) {
        continue;
      }

      try {
        transactions.push(this.toTransaction(record, businessDate));
      } catch (error) {
        errors.push(
          this.error(
            index + 1,
            'INVALID_TRANSACTION_ROW',
            error instanceof Error ? error.message : 'Invalid transaction row',
            record,
          ),
        );
      }
    }

    return {
      provider: this.provider,
      parserVersion: this.version,
      totalRows: rows.length - headerIndex - 1,
      transactions,
      errors,
    };
  }

  private findHeaderIndex(rows: unknown[][]): number {
    return rows.findIndex((row) =>
      row.some(
        (value) =>
          this.normalize(value).includes('transactiondate') &&
          row.some((header) => this.normalize(header).includes('tmrefno')),
      ),
    );
  }

  private toRecord(headers: string[], row: unknown[]): Record<string, unknown> {
    return headers.reduce<Record<string, unknown>>((record, header, index) => {
      record[header] = row[index] ?? null;
      return record;
    }, {});
  }

  private toTransaction(
    record: Record<string, unknown>,
    businessDate: string,
  ): CanonicalTransaction {
    const parsedDateTime = this.parseLocalDateTime(
      this.text(record['transactiondate&time']),
    );
    const transactionAtLocal = parsedDateTime.local;
    const transactionAtUtc = parsedDateTime.utc;
    const credit = this.parseAmount(record.credit);
    const debit = this.parseAmount(record.debit);
    const direction: TransactionDirection =
      credit > 0 && debit === 0
        ? 'INCOMING'
        : debit < 0 && credit === 0
          ? 'OUTGOING'
          : 'UNKNOWN';
    const amount = direction === 'INCOMING' ? credit : Math.abs(debit);
    if (amount <= 0 || direction === 'UNKNOWN') {
      throw new Error('Credit/debit values do not identify a single transaction direction');
    }

    const externalTransactionId = this.text(record.tmrefno);
    const description = this.text(record['detaileddescription']);
    const reference = this.text(record.notes);
    const fingerprint = createHash('sha256')
      .update(
        [
          this.provider,
          externalTransactionId,
          amount.toFixed(2),
          transactionAtUtc.toISOString(),
          direction,
        ].join('|'),
      )
      .digest('hex');

    return {
      provider: this.provider,
      externalTransactionId: externalTransactionId || null,
      transactionStatus: 'COMPLETED',
      direction,
      amount: amount.toFixed(2),
      currency: 'MMK',
      creditAmount: credit.toFixed(2),
      debitAmount: debit.toFixed(2),
      runningBalance: this.parseAmount(record.balance).toFixed(2),
      transactionAtUtc,

      transactionAtLocal,
      localTimezone: TIMEZONE,
      businessDate,
      senderName: null,
      senderPhone: this.extractPhone(description),
      receiverName: null,
      receiverPhone: this.extractPhone(description),
      description: description || null,
      reference: reference || null,
      fingerprint,
      rawRow: record,
    };
  }

  private parseLocalDateTime(value: string): { local: Date; utc: Date } {
    const match = value.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) {
      throw new Error(`Unsupported KBZPay date/time: ${value}`);
    }
    const [, day, month, year, hour, minute, second] = match;
    const localWallClockMillis = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    return {
      local: new Date(localWallClockMillis),
      utc: new Date(localWallClockMillis - 6.5 * 60 * 60 * 1000),
    };
  }

  private parseAmount(value: unknown): number {
    const normalized = this.text(value).replace(/,/g, '');
    if (!normalized) {
      return 0;
    }
    const amount = Number.parseFloat(normalized);
    if (!Number.isFinite(amount)) {
      throw new Error(`Unsupported amount: ${normalized}`);
    }
    return amount;
  }

  private extractPhone(value: string): string | null {
    const match = value.match(/(?:09|\+?959)\d{6,9}/);
    return match?.[0] ?? null;
  }

  private text(value: unknown): string {
    return String(value ?? '').trim();
  }

  private normalize(value: unknown): string {
    return this.text(value).toLowerCase().replace(/[\s_:-]/g, '');
  }

  private error(
    sourceRowNumber: number,
    errorCode: string,
    errorMessage: string,
    rawRow?: Record<string, unknown>,
  ): ParseError {
    return { sourceRowNumber, errorCode, errorMessage, rawRow };
  }
}
