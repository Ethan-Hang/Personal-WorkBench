#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const CANDIDATES = [
  '@citation-js/core@0.8.2',
  '@citation-js/plugin-bibtex@0.8.2',
  '@citation-js/plugin-ris@0.8.2',
  '@citation-js/plugin-csl@0.8.2',
  '@retorquere/bibtex-parser@10.0.1',
  'citeproc@2.4.63',
];

const STYLE_COMMIT = '7b826e23c26b71a36a8d0abaa6ac4bc5aa893bb8';
const STYLE_SOURCES = {
  ieee: {
    url: `https://raw.githubusercontent.com/citation-style-language/styles/${STYLE_COMMIT}/ieee.csl`,
    sha256: 'b4c7619fc16c45a31e4cc3271eab94ffe83192d3b4c7fc729470a3b459448de3',
  },
  chicagoAuthorDate: {
    url: `https://raw.githubusercontent.com/citation-style-language/styles/${STYLE_COMMIT}/chicago-author-date.csl`,
    sha256: '002fade78d7e4fe9d42936a16b43a8066b097013f6255df40b1bfba6631eff9b',
  },
};

const FULL_SCALE = { count: 10_000, targetBytes: 50 * 1024 * 1024 };
const QUICK_SCALE = { count: 1_000, targetBytes: 5 * 1024 * 1024 };
const MAX_STAGE_MS = 120_000;
const MAX_RSS_MIB = 2_048;

function parseArgs(argv) {
  const args = {
    candidateRoot: null,
    keepTemp: false,
    quick: false,
    worker: null,
    stylePath: null,
    count: null,
    targetBytes: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--candidate-root') args.candidateRoot = resolve(argv[++index]);
    else if (argument === '--keep-temp') args.keepTemp = true;
    else if (argument === '--quick') args.quick = true;
    else if (argument === '--worker') args.worker = argv[++index];
    else if (argument === '--style-path') args.stylePath = resolve(argv[++index]);
    else if (argument === '--count') args.count = Number(argv[++index]);
    else if (argument === '--target-bytes') args.targetBytes = Number(argv[++index]);
    else if (argument === '--help') {
      process.stdout.write(`Research Workbench D0 interoperability validation

Usage:
  npm run research:d0
  npm run research:d0 -- --quick
  npm run research:d0 -- --candidate-root /path/to/isolated/npm-prefix
  npm run research:d0 -- --keep-temp

The default run installs pinned candidates into an OS temporary directory, validates
the three-format matrix and CSL snapshots, then runs 10,000-record / 50 MiB workers.
The repository package manifest and lock file are not changed by candidate installation.
`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  return args;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function elapsed(startedAt) {
  return Number((performance.now() - startedAt).toFixed(2));
}

function rssMiB() {
  return Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function packageJsonPath(candidateRoot, packageName) {
  return join(candidateRoot, 'node_modules', ...packageName.split('/'), 'package.json');
}

async function readPackage(candidateRoot, packageName) {
  return JSON.parse(await readFile(packageJsonPath(candidateRoot, packageName), 'utf8'));
}

function loadCitationStack(candidateRoot) {
  const require = createRequire(join(candidateRoot, 'package.json'));
  const core = require('@citation-js/core');
  require('@citation-js/plugin-bibtex');
  require('@citation-js/plugin-ris');
  require('@citation-js/plugin-csl');
  return { ...core, require };
}

async function loadRetorquere(candidateRoot) {
  const entry = join(
    candidateRoot,
    'node_modules',
    '@retorquere',
    'bibtex-parser',
    'dist',
    'esm',
    'index.js',
  );
  return import(pathToFileURL(entry));
}

function makeArticle(index, abstract) {
  return {
    id: `record-${index}`,
    type: 'article-journal',
    title: `Interoperability Study ${index}`,
    author: [
      { family: 'Smith', given: 'Jane' },
      { family: 'Doe', given: 'John' },
    ],
    issued: { 'date-parts': [[2000 + (index % 25)]] },
    'container-title': `Journal ${index % 10}`,
    volume: String(1 + (index % 20)),
    issue: String(1 + (index % 4)),
    page: `${10 + (index % 40)}-${20 + (index % 40)}`,
    DOI: `10.1234/d0.${index}`,
    abstract,
  };
}

function bibtexInput(count, targetBytes) {
  const build = (padding) =>
    Array.from({ length: count }, (_, index) => {
      const year = 2000 + (index % 25);
      return `@article{record-${index},
  title = {Interoperability Study ${index}},
  author = {Smith, Jane and Doe, John},
  year = {${year}},
  journal = {Journal ${index % 10}},
  volume = {${1 + (index % 20)}},
  number = {${1 + (index % 4)}},
  pages = {${10 + (index % 40)}--${20 + (index % 40)}},
  doi = {10.1234/d0.${index}},
  abstract = {${padding}},
  x-d0-unknown = {retain-${index}}
}`;
    }).join('\n\n');
  const base = build('');
  const padding = 'x'.repeat(
    Math.max(0, Math.ceil((targetBytes - Buffer.byteLength(base)) / count)),
  );
  return build(padding);
}

function risInput(count, targetBytes) {
  const build = (padding) =>
    Array.from({ length: count }, (_, index) => {
      const year = 2000 + (index % 25);
      return `TY  - JOUR
ID  - record-${index}
AU  - Smith, Jane
AU  - Doe, John
TI  - Interoperability Study ${index}
T2  - Journal ${index % 10}
PY  - ${year}
VL  - ${1 + (index % 20)}
IS  - ${1 + (index % 4)}
SP  - ${10 + (index % 40)}
EP  - ${20 + (index % 40)}
DO  - 10.1234/d0.${index}
N2  - ${padding}
XX  - retain-${index}
ER  -\x20
`;
    }).join('');
  const base = build('');
  const padding = 'x'.repeat(
    Math.max(0, Math.ceil((targetBytes - Buffer.byteLength(base)) / count)),
  );
  return build(padding);
}

function cslJsonInput(count, targetBytes) {
  const build = (padding) =>
    JSON.stringify(
      Array.from({ length: count }, (_, index) => ({
        ...makeArticle(index, padding),
        'x-d0-unknown': `retain-${index}`,
      })),
    );
  const base = build('');
  const padding = 'x'.repeat(
    Math.max(0, Math.ceil((targetBytes - Buffer.byteLength(base)) / count)),
  );
  return build(padding);
}

function project(records) {
  return records
    .map((record) => ({
      type: record.type ?? null,
      title: record.title ?? null,
      authors: (record.author ?? []).map((author) => [author.family ?? '', author.given ?? '']),
      year: record.issued?.['date-parts']?.[0]?.[0] ?? null,
      containerTitle: record['container-title'] ?? null,
      doi: record.DOI ?? null,
    }))
    .sort((left, right) => String(left.doi).localeCompare(String(right.doi)));
}

function sameProjection(left, right) {
  return JSON.stringify(project(left)) === JSON.stringify(project(right));
}

function outputFormat(cite, format) {
  if (format === 'csl-json') return cite.format('data');
  return cite.format(format);
}

function parseFormat(Cite, format, value) {
  if (format === 'csl-json') return new Cite(JSON.parse(value));
  return new Cite(value);
}

function scanRisRecords(input) {
  const lines = input.match(/.*(?:\r\n|\n|$)/g)?.filter(Boolean) ?? [];
  const records = [];
  let current = null;
  let lineStart = 1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('TY  -')) {
      if (current) records.push({ ...current, complete: false, error: 'missing ER terminator' });
      current = { raw: line, lineStart: index + 1 };
      lineStart = index + 1;
    } else if (current) {
      current.raw += line;
    } else if (line.trim()) {
      records.push({
        raw: line,
        lineStart: index + 1,
        complete: false,
        error: 'content before TY',
      });
    }

    if (current && line.startsWith('ER  -')) {
      records.push({ ...current, lineStart, complete: true, error: null });
      current = null;
    }
  }

  if (current) records.push({ ...current, complete: false, error: 'missing ER terminator' });
  return records;
}

async function runScaleWorker(args) {
  const count = args.count;
  const targetBytes = args.targetBytes;
  assert(Number.isInteger(count) && count > 0, 'worker count is invalid');
  assert(Number.isInteger(targetBytes) && targetBytes > 0, 'worker target bytes are invalid');

  const baselineRssMiB = rssMiB();
  let maxRss = baselineRssMiB;
  const sample = (value) => {
    maxRss = Math.max(maxRss, rssMiB());
    return value;
  };
  const result = {
    worker: args.worker,
    count,
    targetBytes,
    inputBytes: 0,
    parseMs: 0,
    serializeMs: 0,
    outputBytes: 0,
    baselineRssMiB,
    maxObservedRssMiB: 0,
  };

  if (args.worker === 'bibtex-retorquere') {
    const parser = await loadRetorquere(args.candidateRoot);
    const input = sample(bibtexInput(count, targetBytes));
    result.inputBytes = Buffer.byteLength(input);
    const parseStartedAt = performance.now();
    const parsed = sample(parser.parse(input, { sentenceCase: false, unsupported: 'ignore' }));
    result.parseMs = elapsed(parseStartedAt);
    assert(parsed.entries.length === count, 'retorquere scale parse count mismatch');
    assert(parsed.errors.length === 0, 'retorquere scale parse reported errors');
    assert(
      parsed.entries[0].fields['x-d0-unknown'] === 'retain-0',
      'retorquere lost unknown field',
    );
  } else if (args.worker === 'bibtex-citation' || args.worker === 'ris-citation') {
    const { Cite } = loadCitationStack(args.candidateRoot);
    const format = args.worker.startsWith('bibtex') ? 'bibtex' : 'ris';
    const input = sample(
      format === 'bibtex' ? bibtexInput(count, targetBytes) : risInput(count, targetBytes),
    );
    result.inputBytes = Buffer.byteLength(input);
    const parseStartedAt = performance.now();
    const cite = sample(new Cite(input));
    result.parseMs = elapsed(parseStartedAt);
    assert(cite.data.length === count, `${format} scale parse count mismatch`);
    const serializeStartedAt = performance.now();
    const output = sample(cite.format(format));
    result.serializeMs = elapsed(serializeStartedAt);
    result.outputBytes = Buffer.byteLength(output);
    assert(new Cite(output).data.length === count, `${format} scale output count mismatch`);
  } else if (args.worker === 'csl-json-citation') {
    const { Cite } = loadCitationStack(args.candidateRoot);
    const input = sample(cslJsonInput(count, targetBytes));
    result.inputBytes = Buffer.byteLength(input);
    const parseStartedAt = performance.now();
    const native = sample(JSON.parse(input));
    const cite = sample(new Cite(native));
    result.parseMs = elapsed(parseStartedAt);
    assert(cite.data.length === count, 'CSL JSON scale parse count mismatch');
    const serializeStartedAt = performance.now();
    const output = sample(cite.format('data'));
    result.serializeMs = elapsed(serializeStartedAt);
    result.outputBytes = Buffer.byteLength(output);
    assert(JSON.parse(output).length === count, 'CSL JSON scale output count mismatch');
  } else if (args.worker === 'citeproc-bibliography') {
    assert(args.stylePath, 'citeproc worker requires --style-path');
    const { require } = loadCitationStack(args.candidateRoot);
    const CSL = require('citeproc');
    const locale = require(
      join(args.candidateRoot, 'node_modules', '@citation-js', 'plugin-csl', 'lib', 'locales.json'),
    )['en-US'];
    const style = await readFile(args.stylePath, 'utf8');
    const items = Array.from({ length: count }, (_, index) => makeArticle(index, ''));
    const itemMap = Object.fromEntries(items.map((item) => [item.id, item]));
    const parseStartedAt = performance.now();
    const engine = sample(
      new CSL.Engine(
        { retrieveLocale: () => locale, retrieveItem: (id) => itemMap[id] },
        style,
        'en-US',
        true,
      ),
    );
    engine.setOutputFormat('text');
    engine.updateItems(items.map((item) => item.id));
    result.parseMs = elapsed(parseStartedAt);
    const serializeStartedAt = performance.now();
    const bibliography = sample(engine.makeBibliography());
    result.serializeMs = elapsed(serializeStartedAt);
    assert(bibliography, 'citeproc did not produce a bibliography');
    const output = bibliography[1].join('');
    result.outputBytes = Buffer.byteLength(output);
    result.inputBytes = Buffer.byteLength(JSON.stringify(items));
    assert(bibliography[1].length === count, 'citeproc bibliography count mismatch');
  } else {
    throw new Error(`unknown worker: ${args.worker}`);
  }

  sample(null);
  result.maxObservedRssMiB = maxRss;
  if (args.worker !== 'citeproc-bibliography') {
    assert(result.inputBytes >= targetBytes, `${args.worker} input did not reach target bytes`);
  }
  assert(result.parseMs <= MAX_STAGE_MS, `${args.worker} parse exceeded ${MAX_STAGE_MS} ms`);
  assert(
    result.serializeMs <= MAX_STAGE_MS,
    `${args.worker} serialize exceeded ${MAX_STAGE_MS} ms`,
  );
  assert(result.maxObservedRssMiB <= MAX_RSS_MIB, `${args.worker} exceeded ${MAX_RSS_MIB} MiB RSS`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function runWorker(scriptPath, candidateRoot, worker, scale, stylePath = null) {
  const childArgs = [
    '--expose-gc',
    scriptPath,
    '--worker',
    worker,
    '--candidate-root',
    candidateRoot,
    '--count',
    String(scale.count),
    '--target-bytes',
    String(scale.targetBytes),
  ];
  if (stylePath) childArgs.push('--style-path', stylePath);
  const completed = spawnSync(process.execPath, childArgs, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (completed.status !== 0) {
    throw new Error(
      `${worker} failed (${completed.status ?? completed.signal}): ${completed.stderr || completed.stdout}`,
    );
  }
  return JSON.parse(completed.stdout.trim());
}

async function downloadStyles(outputDirectory) {
  const result = {};
  for (const [name, source] of Object.entries(STYLE_SOURCES)) {
    const response = await globalThis.fetch(source.url);
    assert(response.ok, `failed to download ${name}: HTTP ${response.status}`);
    const value = await response.text();
    assert(sha256(value) === source.sha256, `${name} style checksum mismatch`);
    const path = join(outputDirectory, `${name}.csl`);
    await writeFile(path, value, 'utf8');
    result[name] = { ...source, path };
  }
  return result;
}

async function main(args) {
  const scriptPath = resolve(process.argv[1]);
  const ownedTemp = args.candidateRoot === null;
  const candidateRoot =
    args.candidateRoot ?? (await mkdtemp(join(tmpdir(), 'research-interop-d0-')));
  const scale = args.quick ? QUICK_SCALE : FULL_SCALE;
  const startedAt = performance.now();

  try {
    let installMs = 0;
    if (ownedTemp) {
      const installStartedAt = performance.now();
      const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const installed = spawnSync(
        npmExecutable,
        [
          'install',
          '--prefix',
          candidateRoot,
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          ...CANDIDATES,
        ],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
      );
      if (installed.status !== 0) {
        throw new Error(`candidate install failed: ${installed.stderr || installed.stdout}`);
      }
      installMs = elapsed(installStartedAt);
    }

    const packages = {};
    for (const name of [
      '@citation-js/core',
      '@citation-js/plugin-bibtex',
      '@citation-js/plugin-ris',
      '@citation-js/plugin-csl',
      '@retorquere/bibtex-parser',
      'citeproc',
    ]) {
      const metadata = await readPackage(candidateRoot, name);
      packages[name] = { version: metadata.version, license: metadata.license ?? null };
    }

    const { Cite, plugins, require } = loadCitationStack(candidateRoot);
    const retorquere = await loadRetorquere(candidateRoot);
    const CSL = require('citeproc');

    const bibtexUnknown = String.raw`@article{smith2024,
  title = {A {GPU}-Aware Study},
  author = {Smith, Jane and Doe, John},
  year = {2024},
  journal = {Journal of Tests},
  doi = {10.1000/test},
  x-workbench = {retain me},
  file = {:C\:/Papers/test.pdf:application/pdf}
}`;
    const retorquereParsed = retorquere.parse(bibtexUnknown, {
      sentenceCase: false,
      unsupported: 'ignore',
    });
    const citationBibtex = new Cite(bibtexUnknown);
    const citationBibtexOutput = citationBibtex.format('bibtex');
    assert(
      retorquereParsed.errors.length === 0,
      'specialized BibTeX parser rejected valid fixture',
    );
    assert(
      retorquereParsed.entries[0].fields['x-workbench'] === 'retain me',
      'unknown BibTeX field lost',
    );
    assert(
      retorquereParsed.entries[0].fields.file.includes('test.pdf'),
      'BibTeX attachment field lost',
    );
    assert(
      retorquereParsed.entries[0].input === bibtexUnknown,
      'BibTeX raw entry was not retained',
    );
    assert(
      !citationBibtexOutput.includes('x-workbench'),
      'integrated BibTeX output unexpectedly kept unknown field',
    );

    const brokenBibtex = `${bibtexUnknown}\n\n@article{broken, title={Unclosed}\n\n${bibtexUnknown.replace('smith2024', 'smith2025')}`;
    const partialBibtex = retorquere.parse(brokenBibtex, {
      sentenceCase: false,
      unsupported: 'ignore',
    });
    let citationWholeFileError = null;
    try {
      new Cite(brokenBibtex);
    } catch (error) {
      citationWholeFileError = error instanceof Error ? error.message : String(error);
    }
    assert(
      partialBibtex.errors.length > 0,
      'specialized BibTeX parser did not report invalid entry',
    );
    assert(
      partialBibtex.entries.some((entry) => entry.key === 'smith2024') &&
        partialBibtex.entries.some((entry) => entry.key === 'smith2025'),
      'specialized BibTeX parser did not recover surrounding valid entries',
    );
    assert(
      citationWholeFileError,
      'integrated BibTeX parser unexpectedly accepted invalid whole file',
    );

    const risUnknown = `TY  - JOUR
ID  - ris-key
AU  - Smith, Jane
TI  - Interop Study
T2  - Journal of Tests
PY  - 2024
DO  - 10.1000/test
L1  - file:///tmp/paper.pdf
XX  - retain me
ER  -\x20
`;
    const risRecords = scanRisRecords(risUnknown);
    const citationRis = new Cite(risUnknown);
    const citationRisOutput = citationRis.format('ris');
    assert(
      risRecords.length === 1 && risRecords[0].complete,
      'RIS record scanner lost record boundary',
    );
    assert(risRecords[0].raw.includes('XX  - retain me'), 'RIS scanner lost unknown tag');
    assert(
      risRecords[0].raw.includes('L1  - file:///tmp/paper.pdf'),
      'RIS scanner lost attachment tag',
    );
    assert(
      !citationRisOutput.includes('XX  - retain me'),
      'integrated RIS output unexpectedly kept unknown tag',
    );

    const cslUnknown = [
      {
        ...makeArticle(1, 'Fixture abstract'),
        custom: { 'workbench:unknown': 'retain me' },
        'x-workbench': 'retain raw',
      },
    ];
    const cslRaw = JSON.stringify(cslUnknown);
    const citationCslOutput = new Cite(JSON.parse(cslRaw)).format('data');
    assert(
      JSON.parse(cslRaw)[0]['x-workbench'] === 'retain raw',
      'native CSL JSON lost unknown key',
    );
    assert(
      !JSON.parse(citationCslOutput)[0]['x-workbench'],
      'clean CSL output unexpectedly kept unknown key',
    );
    assert(
      JSON.parse(citationCslOutput)[0].custom['workbench:unknown'] === 'retain me',
      'CSL 1.0.2 custom object was lost',
    );

    const fixtures = {
      bibtex: `@article{smith2024,
  title = {Interoperability Study},
  author = {Smith, Jane},
  year = {2024},
  journal = {Journal of Tests},
  doi = {10.1000/test}
}

@article{doe2023,
  title = {Roundtrip Methods},
  author = {Doe, John},
  year = {2023},
  journal = {Methods Quarterly},
  doi = {10.1000/methods}
}`,
      ris: `TY  - JOUR
ID  - smith2024
AU  - Smith, Jane
TI  - Interoperability Study
T2  - Journal of Tests
PY  - 2024
DO  - 10.1000/test
ER  -\x20
TY  - JOUR
ID  - doe2023
AU  - Doe, John
TI  - Roundtrip Methods
T2  - Methods Quarterly
PY  - 2023
DO  - 10.1000/methods
ER  -\x20
`,
      'csl-json': JSON.stringify([
        {
          id: 'smith2024',
          type: 'article-journal',
          title: 'Interoperability Study',
          author: [{ family: 'Smith', given: 'Jane' }],
          issued: { 'date-parts': [[2024]] },
          'container-title': 'Journal of Tests',
          DOI: '10.1000/test',
        },
        {
          id: 'doe2023',
          type: 'article-journal',
          title: 'Roundtrip Methods',
          author: [{ family: 'Doe', given: 'John' }],
          issued: { 'date-parts': [[2023]] },
          'container-title': 'Methods Quarterly',
          DOI: '10.1000/methods',
        },
      ]),
    };
    const roundtrip = [];
    for (const [sourceFormat, input] of Object.entries(fixtures)) {
      const source = parseFormat(Cite, sourceFormat, input);
      for (const targetFormat of Object.keys(fixtures)) {
        const output = outputFormat(source, targetFormat);
        const reparsed = parseFormat(Cite, targetFormat, output);
        const semanticMatch = sameProjection(source.data, reparsed.data);
        assert(semanticMatch, `${sourceFormat} -> ${targetFormat} semantic roundtrip failed`);
        roundtrip.push({
          sourceFormat,
          targetFormat,
          semanticMatch,
          outputBytes: Buffer.byteLength(output),
        });
      }
    }

    const styles = await downloadStyles(candidateRoot);
    const bundledStyles = require(
      join(candidateRoot, 'node_modules', '@citation-js', 'plugin-csl', 'lib', 'styles.json'),
    );
    const bundledLocales = require(
      join(candidateRoot, 'node_modules', '@citation-js', 'plugin-csl', 'lib', 'locales.json'),
    );
    const styleXml = {
      apa: bundledStyles.apa,
      ieee: await readFile(styles.ieee.path, 'utf8'),
      chicagoAuthorDate: await readFile(styles.chicagoAuthorDate.path, 'utf8'),
    };
    const styleNames = { apa: 'apa', ieee: 'd0-ieee', chicagoAuthorDate: 'd0-chicago-author-date' };
    const cslConfig = plugins.config.get('@csl');
    cslConfig.styles.add(styleNames.ieee, styleXml.ieee);
    cslConfig.styles.add(styleNames.chicagoAuthorDate, styleXml.chicagoAuthorDate);

    const citationItems = [
      {
        id: 'smith2024',
        type: 'article-journal',
        title: 'Interoperability Study',
        author: [{ family: 'Smith', given: 'Jane' }],
        issued: { 'date-parts': [[2024]] },
        'container-title': 'Journal of Tests',
        volume: '12',
        issue: '3',
        page: '44-58',
        DOI: '10.1000/test',
      },
      {
        id: 'doe2023',
        type: 'book',
        title: 'Research Methods',
        author: [{ family: 'Doe', given: 'John' }],
        issued: { 'date-parts': [[2023]] },
        publisher: 'Example Press',
        'publisher-place': 'New York',
      },
    ];
    const expectedCitations = {
      apa: '(Doe, 2023; Smith, 2024)',
      ieee: '[1], [2]',
      chicagoAuthorDate: '(Smith 2024; Doe 2023)',
    };
    const engineComparison = [];
    for (const name of Object.keys(styleXml)) {
      const styleName = styleNames[name];
      const cite = new Cite(citationItems);
      const wrapperText = cite.format('bibliography', {
        format: 'text',
        style: styleName,
        lang: 'en-US',
      });
      const wrapperHtml = cite.format('bibliography', {
        format: 'html',
        style: styleName,
        lang: 'en-US',
      });
      const wrapperCitation = cite.format('citation', {
        format: 'text',
        style: styleName,
        lang: 'en-US',
      });
      const items = Object.fromEntries(citationItems.map((item) => [item.id, item]));
      const direct = new CSL.Engine(
        { retrieveLocale: () => bundledLocales['en-US'], retrieveItem: (id) => items[id] },
        styleXml[name],
        'en-US',
        true,
      );
      direct.setOutputFormat('text');
      direct.updateItems(citationItems.map((item) => item.id));
      const directText = direct.makeBibliography()[1].join('');
      assert(wrapperText === directText, `${name} wrapper/direct citeproc output differs`);
      assert(wrapperCitation === expectedCitations[name], `${name} citation snapshot changed`);
      assert(wrapperHtml.includes('csl-entry'), `${name} HTML bibliography lacks CSL entries`);
      engineComparison.push({
        style: name,
        wrapperEqualsDirect: true,
        citation: wrapperCitation,
        textSha256: sha256(wrapperText),
        htmlSha256: sha256(wrapperHtml),
      });
    }

    const scaleWorkers = [
      runWorker(scriptPath, candidateRoot, 'bibtex-retorquere', scale),
      runWorker(scriptPath, candidateRoot, 'bibtex-citation', scale),
      runWorker(scriptPath, candidateRoot, 'ris-citation', scale),
      runWorker(scriptPath, candidateRoot, 'csl-json-citation', scale),
      runWorker(scriptPath, candidateRoot, 'citeproc-bibliography', scale, styles.ieee.path),
    ];

    const output = {
      code: 'RESEARCH_INTEROP_D0_PASSED',
      platform: `${process.platform}-${process.arch}`,
      node: process.version,
      scale,
      isolatedCandidateRoot: ownedTemp,
      installMs,
      packages,
      parserComparison: {
        citationJs: {
          formats: ['BibTeX/BibLaTeX', 'RIS', 'CSL JSON'],
          wholeFileBibtexFailure: citationWholeFileError.split('\n')[0],
          dropsUnknownOnNormalizedOutput: true,
        },
        retorquereBibtex: {
          recoveredKeys: partialBibtex.entries.map((entry) => entry.key),
          errorCount: partialBibtex.errors.length,
          retainsEntryInput: true,
          retainsUnknownFields: true,
        },
        rawEnvelope: {
          bibtexSha256: sha256(retorquereParsed.entries[0].input),
          risSha256: sha256(risRecords[0].raw),
          cslJsonSha256: sha256(cslRaw),
          requiredForSameFormatUnknownRetention: true,
        },
      },
      roundtrip,
      engineComparison,
      engineSelection: {
        selected: 'citeproc-js behind a WorkBench adapter',
        integration:
          '@citation-js/plugin-csl for D1/D2 baseline; keep direct citeproc parity tests',
        rejectedForNow: 'citeproc-rs (officially work in progress; no stable npm release)',
        licenseGate:
          'review citeproc dual CPAL-1.0/AGPL-1.0 obligations before production adoption',
      },
      scaleWorkers,
      thresholds: { maxStageMs: MAX_STAGE_MS, maxRssMiB: MAX_RSS_MIB },
      durationMs: elapsed(startedAt),
      temporaryDirectory: args.keepTemp ? candidateRoot : null,
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    if (ownedTemp && !args.keepTemp) await rm(candidateRoot, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
try {
  if (args.worker) await runScaleWorker(args);
  else await main(args);
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      code: 'RESEARCH_INTEROP_D0_FAILED',
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
}
