# SVG embedding performance benchmark

An Astro showcase and reproducible Chromium lab benchmark for comparing common ways to embed the same deterministic set of SVG icons.

The primary matrix covers `<img />`, `background-image`, `mask-image`, inline SVG and SVG sprites.
Vue hydration is measured separately, while `<embed>`, `<object>` and `<iframe>` are available as showcase-only examples.

## How the benchmark works

The published benchmark renders 1,000 icons per scenario. The showcase also provides 5,000- and 20,000-icon pages for manual inspection.

Two independent probes keep different costs separate:

- Lighthouse measures visual loading, load completion, responsiveness, resource sizes and the Performance Score;
- controlled TBT measures Long Tasks while inserting the icon grid after resources have been prepared.

A full run collects five mandatory measurements per probe and scenario. It uses a mobile viewport, DevTools network throttling
and a 6× CPU slowdown. One robust outlier can trigger two additional probe measurements; retained values are aggregated by median.
The complete methodology and Overall calculation are documented in [article.md](./article.md).

## Requirements

- Node.js 24 or newer;
- pnpm 11 or newer.

## Development

```sh
pnpm install
pnpm dev
```

The development server is available at <http://localhost:3000>.

## Commands

| Command                      | Purpose                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                   | Start the local Astro development server.                                                                |
| `pnpm build`                 | Build the static site into `dist/`.                                                                      |
| `pnpm preview`               | Preview the production build.                                                                            |
| `pnpm lint`                  | Run ESLint and Stylelint.                                                                                |
| `pnpm test:metrics`          | Run the benchmark aggregation tests.                                                                     |
| `pnpm benchmark:smoke`       | Validate every scenario with one measurement without replacing published reports.                        |
| `pnpm benchmark`             | Run the complete benchmark, replace `reports/` atomically and rebuild the site.                          |
| `pnpm benchmark:reaggregate` | Rebuild the summary and representative reports from existing raw measurements without opening a browser. |

The benchmark builds and serves the site itself. A full run is intentionally slow; use the smoke command to validate the pipeline,
not to generate publishable results.

## Generated artifacts

A successful full run writes:

- `reports/summary.json` — aggregated values consumed by the homepage;
- `reports/manifest.json` — environment, scenario order and measurement counts;
- `reports/scenarios/<scenario>/measurements/` — raw JSON for each probe;
- `reports/scenarios/<scenario>/report.html` — the representative Lighthouse report.

All raw values remain available for reviewing ranges and excluded outliers. Release reports are replaced only after the entire run
and artifact validation succeed.

## GitHub Pages

The [Deploy to GitHub Pages workflow](./.github/workflows/deploy-pages.yml) builds and publishes the site after pushes to `master`,
and can also be started manually. It publishes the checked-in benchmark reports; the expensive benchmark itself does not run in CI.

Before the first deployment, open the repository's **Settings → Pages** and select **GitHub Actions** as the source.
The workflow reads the configured Pages origin and base path, so both project sites and custom domains use correct internal links.

## Limitations

These results are a Chromium laboratory stress test, not a prediction for every production page. They are most useful for comparing
implementations under the same controlled conditions.

## License

MIT
