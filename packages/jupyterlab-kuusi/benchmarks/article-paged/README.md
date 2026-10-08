# Article pagination benchmark

Runs the real `paginateArticle` (single-column JS paginator and the dual-column
path) on three deterministic Markdown documents in Chrome, and checks the
resulting layout.

```bash
npm run bench:article          # timings + invariants (median of 5 runs)
npm run bench:article:check    # one run, exits 1 if an invariant fails
node benchmarks/article-paged/run.mjs --only long --profile 1   # Chrome layout counters
node benchmarks/article-paged/run.mjs --only long --cpu 1       # CPU self-time by function
```

Uses the installed Google Chrome through Playwright (no browser download). The
harness uses a small stand-in for JupyterLab's base styles (`base.css`), so
absolute numbers differ from a real session; compare runs against each other.

## Documents

| name  | content                                  | pages (A4) |
|-------|------------------------------------------|-----------:|
| small | mostly prose                             |        ~10 |
| mixed | prose, tables, long code, lists, figures |        ~78 |
| long  | long manuscript                          |       ~311 |

## Invariants (single column)

- **straddle** – a block that would fit on one page crosses a page boundary
- **margin** – a block reaches into the top/bottom page margin (3 px tolerance)
- **stranded-h** – a heading is the last thing on its page
- **text** – the text after pagination equals the text before (repeated table
  headers on continuation pages are ignored on purpose)

Rows: `single` is the JS paginator, `native` is single column broken by the
browser (`column-height`), `dual` is two columns (always native). Dual-column
pages are broken by the browser, so only the text check applies there.

`unused` is the average empty space at the bottom of a page (packing quality).
Source-map table: blocks from the lexer vs. the old heuristic, against the
rendered elements.

## History

| change | small | mixed | long |
|---|---:|---:|---:|
| first measurement (single column) | 7.8 ms | 125 ms | 1550 ms |
| iterate siblings instead of rebuilding the child list per step | 5 ms | 84 ms | 570 ms |
| native pagination for single column (`native` row) | 2 ms | 22 ms | 98 ms |

The first measurement also showed margin overflow of up to 8 px on split code
blocks and one stranded heading; both are fixed and now guarded by `--check`.
