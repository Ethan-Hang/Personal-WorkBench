# Third-party license records

This directory preserves license texts for runtime dependencies whose terms must accompany a distributable WorkBench build.

| Component                 | Version | License expression     | Preserved text                    |
| ------------------------- | ------- | ---------------------- | --------------------------------- |
| `citeproc` / citeproc-js  | 2.4.63  | `CPAL-1.0 OR AGPL-1.0` | `citeproc-2.4.63.txt`             |
| `@citation-js/plugin-csl` | 0.8.2   | MIT                    | `citation-js-plugin-csl-0.8.2.md` |

The Research module also bundles pinned CSL style and locale assets. Each CSL style retains its upstream `<rights>` metadata. Asset revisions and hashes are recorded in `modules/research/src/interop/dependency-manifest.json`.

This source-tree record does not replace a distribution review. Any packaged release that includes citeproc-js must preserve the applicable license text and satisfy one of the package's declared license options.
