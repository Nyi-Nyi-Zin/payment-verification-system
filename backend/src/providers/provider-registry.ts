import { ProviderCode } from '../common/enums/domain.enums';
import {
  ProviderImportParser,
  ProviderOcrExtractor,
} from './provider.contracts';

export class ProviderRegistry {
  private readonly parsers = new Map<ProviderCode, ProviderImportParser>();
  private readonly extractors = new Map<ProviderCode, ProviderOcrExtractor>();

  registerParser(parser: ProviderImportParser): void {
    this.parsers.set(parser.provider, parser);
  }

  registerExtractor(extractor: ProviderOcrExtractor): void {
    this.extractors.set(extractor.provider, extractor);
  }

  getParser(provider: ProviderCode): ProviderImportParser {
    const parser = this.parsers.get(provider);
    if (!parser) {
      throw new Error(`No import parser registered for provider ${provider}`);
    }
    return parser;
  }

  getExtractor(provider: ProviderCode): ProviderOcrExtractor {
    const extractor = this.extractors.get(provider);
    if (!extractor) {
      throw new Error(`No OCR extractor registered for provider ${provider}`);
    }
    return extractor;
  }
}
