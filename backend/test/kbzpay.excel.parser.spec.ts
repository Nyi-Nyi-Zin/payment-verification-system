import * as XLSX from 'xlsx';
import { ProviderCode } from '../src/common/enums/domain.enums';
import { KbzpayExcelParser } from '../src/providers/kbzpay.excel.parser';

function workbookBuffer(): Buffer {
  const rows = [
    ['Account Holder Name:', 'Nyi Nyi Zin'],
    ['Phone Number:', '09675507310'],
    ['NRC/Passport Number:', '11/THATANA(N)111843'],
    ['Account Type:', 'KBZPay Customer Account'],
    ['Time Period:', 'From 23-05-2026 00:00:00 To 22-08-2026 23:59:59'],
    [
      '   Transaction Date & Time',
      '         Tm_Ref_No',
      '               Detailed Description',
      'Notes',
      '        Credit',
      '       Debit',
      '         Balance',
    ],
    [null, null, '          Opening Balance', null, null, null, '     1,170.00'],
    [
      '     23-05-2026 20:59:18',
      '       01004160031336934373',
      'P2P Transfer to 959*********;P2P Transfer from 959*********',
      'မေမေ',
      '       20,000.00',
      '    -0.00',
      '     21,170.00',
    ],
    [
      '     23-05-2026 21:01:10',
      '       01004160071337025087',
      'P2P Transfer to 959*********;P2P Transfer from 959*********',
      'Payment',
      '       0.00',
      '    -18,000.00',
      '     3,170.00',
    ],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('KbzpayExcelParser', () => {
  it('normalizes KBZPay rows and excludes the opening balance', async () => {
    const parser = new KbzpayExcelParser();
    const result = await parser.parse(
      workbookBuffer(),
      'kbzpay.xlsx',
      '2026-05-23',
    );

    expect(result.provider).toBe(ProviderCode.KBZPAY);
    expect(result.transactions).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions[0]).toMatchObject({
      externalTransactionId: '01004160031336934373',
      direction: 'INCOMING',
      amount: '20000.00',
      reference: 'မေမေ',
      currency: 'MMK',
    });
    expect(result.transactions[1]).toMatchObject({
      externalTransactionId: '01004160071337025087',
      direction: 'OUTGOING',
      amount: '18000.00',
      reference: 'Payment',
    });
  });
});
