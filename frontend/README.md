# React + TypeScript + Vite

The four amenity filters always offer `הכול`, `כן`, and `לא`, including after a
selection or when there are no matching rows. Boolean labels are formatted from
their filter value rather than whichever booleans happen to be on the current
page. Property type, condition, and source options come from `/deals.filter_options`, a
catalog of all accepted values independent of current filters and pagination.
Users can switch directly between values without clearing first; unknown
conditions display as `לא ידוע`. The existing city/neighborhood/street hierarchy
is unchanged. Catalog metadata is validated and uses the existing TanStack Query
request; older servers retain a page-based fallback for missing catalog fields.

Location dropdowns follow city → neighborhood → street. All cities stay available;
neighborhood options are scoped only to the selected city, and streets only to
the selected city and neighborhood. Lists come from `/deals.location_options`
over all accepted rows, so selecting a location or narrowing the table never
removes sibling choices. Changing or clearing a city clears neighborhood and
street; changing or clearing a neighborhood clears street. Other filters remain
applied, and pagination returns to page 1. Neighborhoods require a selected city;
until then the disabled dropdown reads `יש לבחור עיר תחילה`. Street choices also
require a city; without a neighborhood selection they cover that city's streets.
During a parent change, outdated child options are disabled
until the matching scope arrives; city choices remain usable for rapid switching.
The existing TanStack Query cancellation ignores late responses. Location metadata
is validated against the requested scope. Older API responses without the catalog
retain the previous page-based fallback; deploy the updated backend to obtain all
location choices. No extra frontend requests are needed.

City options use canonical names from the server, grouping spelling variants and
explicit aliases such as `ב"ש` / `באר-שבע` / `באר שבע` and the Tel Aviv variants.
The `selected_city` metadata keeps an existing alias selection on its canonical
option without appending a duplicate. Raw deal fields remain unchanged.

A compact filtered-results badge appears below search and above the table. It
shows the total matching count and mean price per sqm from `/deals.filtered_summary`,
covering all matching pages. A single-city result also shows the signed percentage
relative to all accepted deals in that city; multiple-city results are labeled
without inventing one city baseline. Empty results explain that no mean can be
calculated. Amounts are rounded to whole shekels and differences to one decimal.
While a request is updating, the badge hides stale figures and announces
`מעדכן סיכום תוצאות…`. Older responses without summary metadata show an unavailable
average rather than estimating it from the current page. This uses the existing
TanStack Query request, caching, error, and cancellation lifecycle.

Three investment filter chips appear directly above search: below neighborhood
average, construction year 2020+, and parking + safe room + elevator. Chips combine
with existing search, ranges, and column filters, reset pagination to page 1, and
toggle off on a second click. The full-package chip updates all three amenity
filters in one request; manual dropdown changes update its active state. The
build-year chip replaces an exact-year choice; choosing an exact year manually
clears its minimum-year filter. Clearing search and filters resets all chips.

The neighborhood chip uses `below_neighborhood_average=true`; the new-build chip
uses `year_built_min=2020`. These are server filters over all accepted rows, before
pagination, rather than estimates from the visible page or LLM assessments.
Neighborhood comparisons require the same city, neighborhood, and property type,
with at least three other deals; unknown neighborhoods are excluded. The visible
chip description explains this dataset-based price-per-sqm comparison.

Each API row carries a validated `row_id` used as its React key. This metadata is
separate from display columns, filters, and repaired fields. It identifies the
saved CSV record for `GET /deals/:row_id/analysis`.

Click a table row or its accessible toggle button to expand deal details directly
under that row. Only one panel is open at a time; clicking the selected row again
or its close button collapses it. The close button returns focus to the row toggle.
Clicks inside the panel keep it open. Pagination, page size, filters, and applied
search changes close the panel. Details show city, street, neighborhood, year
built, rooms, size, price, and price per sqm immediately from the parsed row.
The RTL panel is sized to the table scroller's visible width using a container
query and sticky alignment, with wrapping text and responsive detail columns.

Expanded rows request analysis through TanStack Query and `useDealAnalysis`.
When both street and neighborhood are absent, blank, or case-insensitive `unknown`,
no analysis request is made and a Hebrew explanation is shown. Otherwise the
panel shows a reduced-motion-aware spinner and `מנתח עסקה` while loading, followed
by the assessment, discount/premium relative to the comparison dataset, strengths,
and risks. Unavailable responses, request errors, and timeouts have separate Hebrew
states and manual retry. Deal details remain visible throughout.

Analysis responses are validated for shape, finite numeric values, assessment
consistency, and explanation arrays. Query keys include the API base URL, row ID,
and complete deal snapshot. Successful results stay fresh for five minutes;
unavailable/error results can be retried manually or by reopening. Closing or
switching rows cancels the request, and late responses cannot replace the newly
selected row's analysis. Existing request deadlines, processing polls, and disabled
automatic retries remain in effect. No backend API changes are needed.

All frontend API requests run through TanStack Query. `ApiProvider` owns a stable
query client; `useDeals` and `useImportSummary` use the shared `useApiQuery` hook
for loading, errors, cancellation, and manual retry. Query keys include the API
server address, and table keys also include pagination and canonical filters.
Identical in-flight requests are deduplicated. The table preserves previous rows
while loading another page or filter; summary results remain cached for the
session. Automatic error retries and focus/reconnect refetches are disabled so
the existing explicit retry flow stays predictable. HTTP 202 polling and its
resettable inactivity deadline remain in the API layer under Query cancellation.

The import summary above the table loads `/deals/summary` on mount and
shows accepted rows out of all CSV records, rows with known values completed
by the system, and excluded rows (total minus accepted). Accepted and excluded
percentages use all CSV records as their denominator; the completion percentage
uses accepted rows. Percentages display up to one decimal place, or `—` when
the denominator is zero. Counts cover the entire file and do not change with table filters,
search, or pagination. Unknown-only repairs are excluded from completions. Summary
loading, errors, and retry are independent of table requests; a summary failure
does not block the table or substitute estimated counts.

The deals table loads `GET /deals?page=1&count=20` on mount, using the backend's
default pagination values. It supports page navigation and page sizes of 20, 50,
or 100 rows. Column filters are sent to the backend before pagination and persist
across page and page-size changes. Changing or clearing filters starts at page 1.
Free-text search is sent as `q` and applies to all matching rows before pagination.
Search waits for a 500 ms typing pause before requesting results and returning to
page 1. The input updates immediately; clearing all filters cancels pending search.
Page totals reflect both search and column filters.
The API's `fixed_fields` list marks repaired known values with a light blue
background and repaired unknown values with amber, with variants for both themes.
Hovering or focusing a repaired value shows its Hebrew
column name followed by `הושלם על ידי המערכת` for known values. Unknown values
instead show the column name followed by `לא ידוע`, without claiming completion.
Original cells have no repair mark.
The interface labels this scope explicitly. Rows come from the
API; mock deals are used only in tests.

Copy `.env.example` to `.env` when setting up a checkout. `.env` is ignored by Git.
Run the backend on `http://127.0.0.1:3000` and the frontend with `pnpm dev`.
`API_PROXY_TARGET` in `.env` controls the local backend address. With an empty
`VITE_API_BASE_URL`, Vite proxies `/deals` requests to that address during development.

For deployment, set `VITE_API_BASE_URL` to the public backend address before
running `pnpm build`, for example `VITE_API_BASE_URL=https://api.example.com`.
Both the table and import summary use this address, including processing polls.
A path prefix such as `https://example.com/api` or `/api` is supported.
If the variable is empty, requests use the frontend origin; configure your
production reverse proxy to route `/deals` to the backend. Vite's development
proxy is not part of the production build. For separate frontend and API origins,
the API or its gateway must allow the frontend origin through CORS.
Vite embeds `VITE_` variables at build time, so rebuild after changing the server
address and restart `pnpm dev` after editing `.env`. These variables are public;
store only the public API address here, not credentials.

Requests time out after 10 seconds; errors and invalid responses display a retry
action in Hebrew. Pending requests are cancelled when navigating or unmounting.
HTTP 202 with `status: "processing"` is a normal startup state for the table and
summary. Both show `הנתונים עדיין בעיבוד. נא להמתין…` and poll using `Retry-After`
(default 2 seconds, bounded to 1–5 seconds). Each processing response resets the
request deadline so a healthy long import is not reported as an error. A failed
request, invalid response, or HTTP 503 still shows the retry action. Poll timers
and requests are cancelled on unmount or when query parameters change.

Verification: `pnpm test:coverage`, `pnpm build`, and `pnpm lint`.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
