import { ProviderCode } from '../common/enums/domain.enums';
import type { OcrExtraction, TransactionDirection } from '../providers/provider.contracts';

export interface BusinessWalletIdentity {
  provider: ProviderCode;
  accountName: string;
  phoneNumber?: string | null;
  allowOutgoingAutoVerify: boolean;
}

export interface TransferParty {
  name?: string | null;
  phone?: string | null;
}

export interface DirectionClassification {
  provider: ProviderCode;
  direction: TransactionDirection;
  matchedBy: 'SENDER' | 'RECEIVER' | 'BOTH' | 'NONE';
  reasonCode:
    | 'BUSINESS_WALLET_IS_RECEIVER'
    | 'BUSINESS_WALLET_IS_SENDER'
    | 'BUSINESS_WALLET_MATCHES_BOTH_SIDES'
    | 'BUSINESS_WALLET_NOT_FOUND_IN_PARTIES';
}

export class DirectionClassifier {
  classifyOcr(
    wallet: BusinessWalletIdentity,
    extraction: Pick<OcrExtraction, 'sender' | 'senderPhone' | 'receiver' | 'receiverPhone'>,
  ): DirectionClassification {
    return this.classify(
      wallet,
      { name: extraction.sender, phone: extraction.senderPhone },
      { name: extraction.receiver, phone: extraction.receiverPhone },
    );
  }

  classify(
    wallet: BusinessWalletIdentity,
    sender: TransferParty,
    receiver: TransferParty,
  ): DirectionClassification {
    const senderMatches = this.matches(wallet, sender);
    const receiverMatches = this.matches(wallet, receiver);

    if (senderMatches && receiverMatches) {
      return {
        provider: wallet.provider,
        direction: 'UNKNOWN',
        matchedBy: 'BOTH',
        reasonCode: 'BUSINESS_WALLET_MATCHES_BOTH_SIDES',
      };
    }

    if (receiverMatches) {
      return {
        provider: wallet.provider,
        direction: 'INCOMING',
        matchedBy: 'RECEIVER',
        reasonCode: 'BUSINESS_WALLET_IS_RECEIVER',
      };
    }

    if (senderMatches) {
      return {
        provider: wallet.provider,
        direction: 'OUTGOING',
        matchedBy: 'SENDER',
        reasonCode: 'BUSINESS_WALLET_IS_SENDER',
      };
    }

    return {
      provider: wallet.provider,
      direction: 'UNKNOWN',
      matchedBy: 'NONE',
      reasonCode: 'BUSINESS_WALLET_NOT_FOUND_IN_PARTIES',
    };
  }

  normalizeName(value: string | null | undefined): string {
    return (value ?? '')
      .normalize('NFKC')
      .toLocaleUpperCase('en-US')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  normalizePhone(value: string | null | undefined): string {
    const digits = (value ?? '').replace(/\D/g, '');
    if (digits.startsWith('959')) {
      return `0${digits.slice(3)}`;
    }
    if (digits.startsWith('9') && digits.length >= 9 && digits.length <= 10) {
      return `0${digits}`;
    }
    return digits;
  }

  private matches(wallet: BusinessWalletIdentity, party: TransferParty): boolean {
    const walletName = this.normalizeName(wallet.accountName);
    const partyName = this.normalizeName(party.name);
    const nameMatches = Boolean(walletName && partyName && walletName === partyName);

    const walletPhone = this.normalizePhone(wallet.phoneNumber);
    const partyPhone = this.normalizePhone(party.phone);
    const phoneMatches = Boolean(walletPhone && partyPhone && walletPhone === partyPhone);

    return nameMatches || phoneMatches;
  }
}
