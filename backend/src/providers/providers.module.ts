import { Global, Module } from "@nestjs/common";
import { ProviderRegistry } from "./provider-registry";
import { KbzpayExcelParser } from "./kbzpay.excel.parser";
import { AyapayOcrExtractor } from "./ayapay.ocr.extractor";
import { WavepayOcrExtractor } from "./wavepay.ocr.extractor";
import { KbzpayOcrExtractor } from "./kbzpay.ocr.extractor";

@Global()
@Module({
  providers: [
    KbzpayExcelParser,
    AyapayOcrExtractor,
    WavepayOcrExtractor,
    KbzpayOcrExtractor,
    {
      provide: ProviderRegistry,
      inject: [
        KbzpayExcelParser,
        AyapayOcrExtractor,
        WavepayOcrExtractor,
        KbzpayOcrExtractor,
      ],
      useFactory: (
        kbzpayParser: KbzpayExcelParser,
        ayapayExtractor: AyapayOcrExtractor,
        wavepayExtractor: WavepayOcrExtractor,
        kbzpayExtractor: KbzpayOcrExtractor,
      ) => {
        const registry = new ProviderRegistry();
        registry.registerParser(kbzpayParser);
        registry.registerExtractor(ayapayExtractor);
        registry.registerExtractor(wavepayExtractor);
        registry.registerExtractor(kbzpayExtractor);
        return registry;
      },
    },
  ],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
