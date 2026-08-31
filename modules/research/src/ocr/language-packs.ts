import { createRequire } from 'node:module';
import type { OcrLanguage } from '../contract.js';

const require = createRequire(import.meta.url);

export const TESSERACT_ENGINE = 'tesseract.js';
export const TESSERACT_ENGINE_VERSION = '7.0.0';
export const OCR_LANGUAGE_PACK_VERSION = '4.0.0_best_int/npm-1.0.0';
export const OCR_LANGUAGE_CACHE_DIRECTORY = 'tessdata-cache';

export interface OcrLanguagePack {
  language: OcrLanguage;
  packageName: string;
  packageVersion: '1.0.0';
  datasetVersion: '4.0.0_best_int';
  license: 'MIT';
  sha256: string;
  filePath: string;
}

const PACKS: Record<OcrLanguage, Omit<OcrLanguagePack, 'filePath'>> = {
  eng: {
    language: 'eng',
    packageName: '@tesseract.js-data/eng',
    packageVersion: '1.0.0',
    datasetVersion: '4.0.0_best_int',
    license: 'MIT',
    sha256: '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
  },
  chi_sim: {
    language: 'chi_sim',
    packageName: '@tesseract.js-data/chi_sim',
    packageVersion: '1.0.0',
    datasetVersion: '4.0.0_best_int',
    license: 'MIT',
    sha256: 'b8a23f10c7de500891eb458a8adc9cc58ab7f242f08b7d149f5e9aea4ad5db7c',
  },
};

export function resolveOcrLanguagePack(language: OcrLanguage): OcrLanguagePack {
  const metadata = PACKS[language];
  return {
    ...metadata,
    filePath: require.resolve(
      `${metadata.packageName}/${metadata.datasetVersion}/${language}.traineddata.gz`,
    ),
  };
}

export function resolveOcrLanguagePacks(languages: OcrLanguage[]): OcrLanguagePack[] {
  return languages.map(resolveOcrLanguagePack);
}
