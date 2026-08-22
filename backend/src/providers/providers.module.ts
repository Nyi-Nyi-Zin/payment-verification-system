import { Global, Module } from '@nestjs/common';
import { ProviderRegistry } from './provider-registry';
import { KbzpayExcelParser } from './kbzpay.excel.parser';
import { AyapayOcrExtractor } from './ayapay.ocr.extractor';
import { WavepayOcrExtractor } from './wavepay.ocr.extractor';

@Global()
@Module({
  providers: [
    KbzpayExcelParser,
    AyapayOcrExtractor,
    WavepayOcrExtractor,
    {
      provide: ProviderRegistry,
      inject: [KbzpayExcelParser, AyapayOcrExtractor, WavepayOcrExtractor],
      useFactory: (
        kbzpayParser: KbzpayExcelParser,
        ayapayExtractor: AyapayOcrExtractor,
        wavepayExtractor: WavepayOcrExtractor,
      ) => {
        const registry = new ProviderRegistry();
        registry.registerParser(kbzpayParser);
        registry.registerExtractor(ayapayExtractor);
        registry.registerExtractor(wavepayExtractor);
        return registry;
      },
    },
  ],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
