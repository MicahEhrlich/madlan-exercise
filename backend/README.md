# Backend

Simple Node.js server using Fastify and TypeScript with strict type checking.

```sh
pnpm install
pnpm dev
```

Check types with `pnpm typecheck`.

Run unit tests with `pnpm test`, or enforce at least 80% statement, branch,
function, and line coverage with `pnpm test:coverage`. Backend CI runs type
checking, compilation, and coverage checks. Coverage includes all backend source
files, including the server entry point.

For production, compile the TypeScript and start the server:

```sh
pnpm build
pnpm start
```

The server defaults to `http://127.0.0.1:3000`. Override the address with the
`HOST` and `PORT` environment variables.

`GET /health` returns HTTP 200 with `{"status":"ok"}` when the server is running.

## Environment configuration

The backend automatically loads `backend/.env` in development and compiled startup,
regardless of the working directory. A missing `.env` is allowed. Copy
`.env.example` to `.env` when setting up a new checkout; `.env` is ignored by Git.
Shell/deployment environment variables override values in `.env`.

```dotenv
ANTHROPIC_API_KEY=
BATCH_SIZE=
CSV_FILE_PATH=
LLM_BATCH_SIZE=
ANTHROPIC_MODEL=
REDIS_URL=
REDIS_CACHE_TTL_SECONDS=
CORS_ORIGINS=
```

- `ANTHROPIC_API_KEY`: enables Anthropic repair during import. When missing or blank,
  LLM repair is skipped; code corrections still run. Credentials are never logged.
- `CORS_ORIGINS`: comma-separated frontend HTTP(S) origins allowed to read the API
  from a browser. Missing or blank disables cross-origin access. Paths, wildcards,
  credentials, queries, and fragments are rejected; trailing slashes are normalized.
  Same-origin requests and server clients continue to work. CORS covers preflight,
  loading, and error responses, and exposes `Retry-After` for startup polling.

- `BATCH_SIZE`: defaults to 1,000 when missing or blank. A supplied value must be
  a positive safe integer or startup fails.
- `CSV_FILE_PATH`: defaults to the existing root CSV when missing or blank.
  Relative paths resolve from `backend/`; absolute paths are supported. Quote paths
  containing spaces in `.env`.
- `LLM_BATCH_SIZE`: defaults to 5, independently of CSV `BATCH_SIZE`. Must be a
  positive safe integer. The output-token estimate can reduce the effective size.
- `ANTHROPIC_MODEL`: defaults to `claude-haiku-4-5-20251001`.
- `REDIS_URL`: enables response caching when set to a `redis://` or `rediss://`
  connection URL. Missing or blank leaves caching disabled. Invalid URLs fail
  configuration validation without exposing credentials.
- `REDIS_CACHE_TTL_SECONDS`: expiration in seconds, default **300** (five minutes).
  Must be a positive safe integer, even when caching is disabled.

For the Render API and Vercel frontend, set this environment variable on **Render**
and redeploy the backend with the CORS changes:

```dotenv
CORS_ORIGINS=https://frontend-rust-pi-90.vercel.app
```

On **Vercel**, set `VITE_API_BASE_URL=https://madlan-exercise.onrender.com` and
rebuild the frontend if that value changes. For direct local API access, add
`http://localhost:5173` to `CORS_ORIGINS`, separated by a comma. The Vite development
proxy does not require CORS.

`strict-origin-when-cross-origin` is the browser's referrer policy; it does not
grant CORS access. A successful cross-origin response must include
`Access-Control-Allow-Origin: https://frontend-rust-pi-90.vercel.app`.

## Redis response cache

`GET /deals` validates query parameters before accessing Redis. Successful results,
including empty results and pages beyond the last result, are cached as complete
JSON responses with all pagination fields and each row's `fixed_fields` metadata.
HTTP 400 responses are never cached. The HTTP API and `/health` response are unchanged.

Keys have the form `deals:v1:<dataset-sha256>:<canonical-query-json>`. The query
includes every supplied, parsed filter, search, page, and count. Keys are sorted,
defaults are included, and an empty search is omitted, so reordered parameters,
trimmed text, equivalent numbers, and omitted/default pagination reuse entries.
Different queries and pagination values get separate entries. The fingerprint is
computed once from the final loaded collection, including repair metadata and row
order. A changed import uses a different namespace; old entries expire naturally
without flushing other Redis keys. Bump the `v1` namespace if response semantics
change in a future release.

On a hit, cached JSON is validated for response shape, pagination consistency,
row values, and repair metadata. Invalid entries are recalculated and overwritten.
On a miss, results are calculated from the loaded data and stored with an atomic
Redis `SET` with expiration. Reads do not extend the entry's lifetime.

Connections start in the background only after the CSV finishes loading. An
unavailable cache never delays readiness. Connection attempts have a 500 ms socket
timeout and reconnect with backoff from 100 ms up to 5 seconds. Offline command
queues are disabled and the command queue is bounded. Reads and writes each have
a 200 ms deadline with cancellation; a failed read skips the write and returns
freshly calculated results. Redis errors are handled, and connections, reconnects,
and pending commands are cancelled at shutdown. Cache warnings contain only the
operation name and a generic message, not URLs, credentials, queries, or response data.

For local development, start a disposable Redis server with Docker:

```sh
docker run --rm --name madlan-redis -p 127.0.0.1:6379:6379 redis:8-alpine
```

Set these values in `backend/.env` and restart the backend:

```dotenv
REDIS_URL=redis://127.0.0.1:6379
REDIS_CACHE_TTL_SECONDS=300
```

Redis is optional for development and CI. Unit tests inject cache/client doubles
and require no Redis server. Programmatic callers can supply `redisUrl` and
`redisCacheTtlSeconds` in `buildApp`'s second argument, or inject a typed `cache`
adapter for testing; an injected adapter takes precedence over `redisUrl`.

An optional integration test uses an actual Redis instance, checks stored JSON,
hits, expiration, and corrupt-entry replacement, then removes its own test key:

```sh
REDIS_TEST_URL=redis://127.0.0.1:6379 pnpm exec vitest run test/redisIntegration.test.ts
```

## Startup CSV loading

After the HTTP server starts, it reads in the background
`../madlan_deals_sample (3) (2) (1) (1).csv`. The location is resolved relative to
the loader module, so it works from any working directory in development and
after compilation. Keep the root CSV available alongside the backend when
deploying. The file is never modified.

Accepted deals are available internally as `app.deals`, a typed, frozen array of
frozen objects. Loading happens once per server instance; updates require a
restart. `GET /deals` exposes the collection with filtering and pagination.
The frontend loads this endpoint with pagination. There is no database yet.

During import, `GET /deals`, its alias `GET /deal`, and `GET /deals/summary`
return HTTP **202** with `{"status":"processing","message":"הנתונים עדיין בעיבוד. נא להמתין."}`,
`Retry-After: 2`, and `Cache-Control: no-store`. These responses never access Redis
or expose partial data. The frontend displays a processing message and polls again
until it receives completed data. Once loaded, the existing HTTP 200 payloads apply.
An import failure returns HTTP **503** with `status: "error"` and a generic Hebrew
message instead of remaining in processing. `/health` remains a liveness endpoint
and returns `{"status":"ok"}` while the server is running, including during import.

For programmatic callers, `app.ready()` waits for HTTP route registration;
`await app.waitForDeals()` waits for the import and rejects on an import error.
The import runs once. A failed import requires a server restart after correcting
the source/configuration. Closing during import prevents later publication or
starting the Redis client, without waiting for model requests to complete.

### Querying deals

Responses also include `location_options` with `cities`, `neighborhoods`, `streets`,
and `scope: { city, neighborhood }` (null means no selected parent). `selected_city`
provides the canonical selected city, or null. Cities come
from the full accepted dataset. Neighborhood choices use only the selected city;
street choices use only the selected city and neighborhood. Each list ignores its
own selected value, search, presets, other filters, and pagination. With no parent
selected, the corresponding list spans all accepted rows. Names are deduplicated
and sorted with Hebrew collation; explicit `unknown` values remain filterable.
Options remain available even when the table has no matching rows. This metadata
uses the existing `/deals` and `/deal` requests, without additional endpoints or
model calls. Cached responses validate the metadata and its requested parent scope;
the `deals:v4` namespace bypasses older entries without canonical city options.

City identity normalizes whitespace, directional formatting marks, and dash/quote
typography. Explicit aliases in `cityName.ts` group Tel Aviv forms (`ת"א`,
`תל אביב`, `תל אביב יפו`), Beer Sheva (`ב"ש`, `באר-שבע`), and Modiin forms.
Hyphenated city words such as `בית-שמש` normalize to spaces. The canonical city
option matches all corresponding raw city spellings. Location catalogs, city
filters, summaries, neighborhood benchmarks, and analysis comparisons use this
same identity; original saved fields and source CSV files remain unchanged.
There is no fuzzy matching, and distinct names such as `מודיעין עילית` are retained.
Analysis cache policy version 2 prevents reuse of pre-normalization assessments.

Every `/deals` and `/deal` response includes `filtered_summary` alongside the
existing pagination fields:

```json
{
  "average_price_per_sqm": 41200,
  "city_comparison": {
    "city": "חיפה",
    "average_price_per_sqm": 43829.78723404255,
    "difference_pct": -6
  }
}
```

These illustrative values describe the summary object, not actual sample results.
The filtered mean is the arithmetic mean of accepted, repaired `price_per_sqm`
values across **all matching rows before pagination**. It is not size-weighted.
When matches belong to exactly one city, its baseline is the arithmetic mean of
all accepted rows in that city, without the active filters; it includes the
matching rows and all property types. The signed percentage is
`(filtered_mean / city_mean - 1) * 100`, rounded to one decimal. Negative means
below the city dataset average. No minimum sample size or market valuation is
implied by this descriptive counter.

Multiple-city results have `city_comparison: null`. Empty results have both
summary fields null. Pagination, including an empty page beyond the last page,
does not change the summary. Search, presets, ranges, and all other filters do.
The response remains cached as a unit with its summary; cache keys use `deals:v4`
so older entries without summaries are bypassed. Cache validation checks summary
shape, finite positive means, percentage consistency, and result-count consistency.
The global import summary endpoint is unchanged. No extra LLM calls are made.

Investment presets use two additional optional `/deals` (and `/deal`) filters:

- `year_built_min`: positive integer, inclusive; rows with an unknown year do not match.
- `below_neighborhood_average`: exactly `true` or `false`. When true, return only
  rows strictly below the average price per sqm for the same city, neighborhood,
  and property type in the full accepted dataset. Require at least three other
  comparable rows (four including the target); unknown/blank neighborhoods never
  match. Equal-to-average rows are excluded. There is no city fallback, time
  adjustment, or external market inference. False leaves this predicate inactive.

Benchmarks use repaired, accepted values before any search, user filter, or
pagination. An inclusive group mean has the same strict-below predicate as the
mean of the other group members. An incremental mean avoids overflow and keeps
identical-price groups from acquiring rounding-induced discounts. Discounted row
identities are computed once per loaded dataset and supplied to cached-page
validation, so a page is never used as its own comparison population.
The new predicates combine with all existing filters and are included in cache
keys. The full-package preset uses the existing `has_parking=true`,
`has_safe_room=true`, and `has_elevator=true` filters. No model calls or source
CSV modifications are involved.

Each saved row includes a unique `row_id` (`row-<logical CSV record number>`),
independent of repeated deal IDs, filtering, pagination, and deferred repairs.
Excluded rows leave gaps; IDs remain stable while the source file is unchanged.
This metadata is separate from CSV columns and `fixed_fields`.

`GET /deals/:row_id/analysis` provides an LLM assessment using accepted rows and
repaired values. See [the analysis endpoint contract](ANALYSIS.md) for eligibility,
comparison rules, response formats, deadlines, and caching.

`GET /deals/summary` returns the completed import's global counts:
`{ total_rows, parsed_rows, completed_rows }`. `total_rows` counts source CSV
records, including rejected/duplicate records, excluding the header and empty
lines. Quoted embedded newlines do not create extra records. `parsed_rows` is the
number of accepted, saved rows. `completed_rows` counts each accepted row once
when at least one field in `fixed_fields` has a known value. Unknown-only repairs
are excluded from completion counts. The immutable summary is computed only
after a successful import and is independent of filters, pagination, and Redis.
The frontend displays these counts above the table; `/deals` keeps its existing
paginated response format.

`GET /deals` accepts optional exact-match filters: `city`, `neighborhood`,
`street`, `property_type`, `rooms`, `size_sqm`, `floor`, `total_floors`,
`year_built`, `condition`, `has_elevator`, `has_parking`, `has_balcony`,
`has_safe_room`, `deal_date`, `price_nis`, `price_per_sqm`, `source`, and `row_status`.
All supplied filters must match. Text is trimmed; dates use `YYYY-MM-DD`.
Boolean parameters accept exactly `true` or `false`. `year_built` accepts a
positive integer or `unknown`. Numeric filters use decimal numbers; floor and
total floors accept nonnegative integers. `floor` also accepts `unknown`.
`row_status` accepts `original` or `fixed`. Filtering uses the saved, repaired data.
The optional `q` parameter searches raw values and Hebrew display values across
table columns. Search and filters combine before calculating totals and pages.

`page` starts at 1 (default: 1). `count` is the maximum rows per page (default:
20, maximum: 100). Both must be positive safe integers. Invalid, repeated, or
unsupported parameters return HTTP 400 with a Hebrew error and affected field
paths. Filters are applied before pagination, preserving CSV import order.

Example: `GET /deals?rooms=3&has_parking=false&page=1&count=10`

The JSON response contains `page`, `count`, `total` (matching rows), `total_pages`,
and `rows` (complete saved deals, including `deal_id` and `row_status`). No matches
produce `total: 0`, `total_pages: 0`, and `rows: []`. A page beyond the last page
returns an empty `rows` array while retaining the matching totals. URL-encode
Hebrew text when constructing requests, for example with `URLSearchParams`.

Every saved row includes `row_status: 'original' | 'fixed'` and `fixed_fields`,
an array of repaired column names, for example `["floor", "price_per_sqm"]`.
`GET /deals` returns this metadata on each row, including filtered/paginated results.
Original rows have `fixed_fields: []`; `row_status` is derived from whether this
array is empty. The array is frozen along with the saved row. Code corrections
(including derived values and missing-value defaults), verified model repairs,
and safe lookup fallbacks are `fixed`. Ordinary parsing, whitespace trimming,
boolean normalization, and retaining a reused ID without changing data remain
`original`. This metadata is assigned by the loader, separately from the 19 CSV
columns and model payloads; the source CSV is unchanged. The frontend mock table
shows the same status field as מקורית / הושלמו על ידי המערכת and supports searching and filtering it.

### Streaming and batches

The CSV is read through a file stream and the streaming `csv-parse` parser,
instead of reading the entire file and parsing every record at once. By default,
the loader processes **1,000 input records per batch**, including rejected rows.
It validates each batch, appends its accepted deals to the in-memory collection,
and yields to the event loop before requesting the next batch. The last partial
batch is processed at the end of the file. Stream backpressure limits read-ahead,
and streams are closed on completion, failure, or early cancellation.

Set a positive integer `BATCH_SIZE` in `.env` or the shell to choose a different batch size:

```sh
BATCH_SIZE=500 pnpm dev
```

Programmatic callers can use
`loadDeals(logger, csvPath, { batchSize: 500 })` or
`buildApp(options, { csvPath, batchSize: 500 })`.

Each `Deals CSV batch saved` log reports the batch number, input records processed,
deals accepted while processing that batch (including deferred repairs from earlier
batches), and cumulative input count. Duplicate detection and
CSV record numbering continue across batch boundaries. A failed import makes data
endpoints unavailable, and the app never exposes a partially imported collection.

Raw CSV parsing memory is limited to a batch plus stream/parser buffers and the
current record. Accepted deals, their duplicate-identity index, and identities
deferred for source lookup remain in memory, so total memory grows with those sets. Batching does not make
an arbitrarily large accepted dataset fit in RAM; no files or database are used
to persist batches locally.

### Normalization and rejection rules

- All 19 expected columns must be present exactly once; extra columns are rejected.
  Header order may vary. UTF-8 BOM, quoted commas/newlines, and empty lines are supported.
- Surrounding whitespace is trimmed. City names containing English letters are
  translated into Hebrew by the LLM before validation and duplicate detection;
  untranslatable rows are excluded. Other text is preserved. Missing `condition` and `floor` default to
  the literal `unknown`; missing `has_parking` defaults to `false` by application
  policy. Defaults are logged with `kind: "default"`, rather than treated as observed
  property facts. Nonempty malformed floor or parking values are not defaulted.
  Missing construction year and neighborhood use verified lookup values when
  available, otherwise the literal `unknown`. Other fields remain required unless
  a financial value can be derived below.
- Boolean amenities accept `כן/לא`, `yes/no`, `true/false`, and `1/0`.
  English values are case-insensitive.
- Numeric values accept complete numbers and correctly grouped thousands separators.
  Prices may start with `₪`; rooms may have a trailing `חדרים`.
- Rooms, size, and prices must be positive finite numbers. A known floor must be
  a nonnegative integer and cannot exceed the building's total floors; `unknown`
  is also accepted for the property floor. Total floors must remain a nonnegative
  integer. Construction year must be a positive integer or `unknown`. No market-price limits
  or statistical outlier filters are applied.
- Dates must be real, exact calendar dates in `YYYY-MM-DD`, `DD/MM/YYYY`, or
  `DD.MM.YYYY` format and are stored as `YYYY-MM-DD`. English abbreviated month/year
  values in `MMM YYYY` format are converted in code, using day `01`: for example,
  `Mar 2023` becomes `2023-03-01`. Month names are case-insensitive and surrounding
  whitespace is accepted. This works without the LLM and is logged with
  `kind: "default"` to distinguish the defaulted day from an observed date.
  Other supported formats remain eligible for LLM repair only if every other row
  error is also repairable. Missing years/months and impossible dates are not guessed.
- Code uses `price_nis = price_per_sqm * size_sqm` to derive a single missing or
  invalid financial value from the other two positive finite values: multiply to
  derive total price, or divide to derive size or unit price. It never invents two
  unknown financial values, divides by zero, or stores an infinite/zero result.
  When all three supplied values are positive but inconsistent, total price and
  size remain authoritative and unit price is recalculated. An existing unit price
  within 1 NIS/m² is preserved. Derived fields are logged with `kind: "derived"`;
  the source CSV is unchanged. All remaining validation still applies.
- A duplicate requires the same trimmed `deal_id`, `city`, and `street`. The first
  valid row for that combination wins; invalid rows do not reserve it. Reused IDs
  at different cities or streets are retained without rewriting the ID or other
  values, provided all other validation passes. Different IDs at the same address
  are not merged. This exception is handled entirely in code, with a separate
  `CSV ID collision retained by code` log; accepted collisions count as code-only
  corrections unless the row also required LLM repair.

Each rejected record produces a separate structured warning (`Rejected CSV deal`)
with `recordNumber`, `rawFields`, and `reasons`. Record numbers count logical CSV
records, including the header as record 1; quoted newlines do not create additional
records, and empty lines are skipped. Original fields are logged before trimming
or normalization. Rejected rows are not stored in the deal collection.

A final `Deals CSV load complete` message contains `total`, `accepted`, and
`rejected` counts. Missing/unreadable files, invalid headers, unrecoverable CSV
syntax, and files with no valid deals fail the background import. Rows with incorrect field
counts are logged and skipped when the parser can safely continue.

### Sample CSV verification

With LLM access disabled, the supplied file contains **530 records: 503 accepted,
27 rejected**, with 503 unique accepted IDs. Of the accepted rows, 375 pass original
validation and 128 are accepted after code corrections/defaults, including explicit
unknown lookup values. Seven rows require city translation (four `Tel Aviv-Yafo`
and three `Jerusalem`) and are excluded without successful model translations.
Mocked successful translations recover these seven rows, yielding 510 accepted
and 20 rejected; this is a test result, not a claim about live model output. This sample has no
repeated IDs at differing cities or streets, so the address-aware duplicate policy
does not change its totals.

Remaining rejection reasons include insufficient financial operands and duplicate ID/address
combinations. A row can have several reasons, so reason counts should not be summed
to obtain the number of rejected records.

## Anthropic repair

### English city names

Before other repairs, each distinct English city name is sent with the exact prompt
`Translate the follwing city name X into Hebrew`, substituting the trimmed name for
`X`. The existing `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` settings apply. The model
is instructed to return only the Hebrew city name, or `UNKNOWN` if translation is
ambiguous or impossible. Responses must be complete and contain a bounded Hebrew
name; empty, English, multiline, malformed, and recognized failure responses are rejected.
These checks validate output shape; they cannot independently establish a model
translation's factual accuracy.

Successful and failed translations are cached by case-insensitive name for the
duration of the import, including the lookup pass. Requests have a 10-second hard
deadline and a separate 30-second cumulative translation budget, with no retries.
A service failure or timeout disables further translation calls for that import.
Rows without a successful translation are excluded, including when credentials
are absent. Hebrew rows continue through the existing import pipeline.
Duplicate detection uses the translated city, and city changes appear in
`fixed_fields`, completion counts, LLM correction counts, and structured logs.
The original CSV remains unchanged. Tests inject translations; no paid API calls
are required for verification.

Before queueing a row, the backend checks whether **every remaining error** has a
verifiable repair path, using the same evidence checks applied to returned model
proposals. Missing construction year or neighborhood is now eligible for a
source-backed lookup if all other errors can be repaired. Rows with impossible
dates or insufficient financial operands (such as both size and unit price
missing) are rejected locally without an API call, even if another field is fixable.
Only eligible unresolved rows accumulate across CSV batch boundaries. Requests run sequentially,
with up to `LLM_BATCH_SIZE` rows and a conservative 2,048-output-token limit. A local
UTF-8 byte-based estimate reserves 256 tokens for the JSON envelope and reduces
batch size when necessary; this is a heuristic, not a model-speed guarantee. Rows
that cannot fit individually are rejected without a request. Remaining rows are
flushed at EOF. Pending occurrences of the same ID/city/street combination are
resolved before later duplicates, which can also trigger an early flush. Repeated
IDs with distinct addresses can share an LLM request; results are matched by the
full identity rather than ID alone, including when returned out of order. Final accepted rows retain CSV order.

The original user-supplied prompt and four response keys are preserved in the
repair prompt module. Additional instructions require compact structured JSON,
unchanged valid fields, and no unsupported estimates or instructions from row data.
The LLM must return complete rows with `deal_date` matching `YYYY-MM-DD`. Supported
date evidence includes day-first/year-first numeric formats, month/year numeric
formats, and English/Hebrew named months. Existing full dates retain their original
day, month, and year; only a missing day defaults to `01`. Code independently checks
the returned date against that evidence, and logs `dateDayDefaulted` for accepted
repairs.
Failed rows must be exact copies of their original raw objects. Counts, IDs,
partition membership, field types, existing valid values, and complete row
validation are all checked independently of the model. Backend counts replace
unverifiable model claims.

The evidence verifier currently supports explicit alternate amenity values
`יש/אין` and field-appropriate numeric units such as `rooms`, `חדר`, `sqm`, `מ״ר`,
`m²`, `NIS`, `ש״ח`, and `₪`. It checks these representations independently before
accepting a model proposal. Recovering a missing construction year or neighborhood
requires the source lookup described below; otherwise it remains `unknown`.
For a supplied year and month with no day, day `01` is explicitly allowed by policy;
it is not represented as an observed day. The model must preserve the
application's `unknown` floor/condition and `false` parking defaults, without
replacing them with estimates. A single missing financial value can also be verified
arithmetically after an evidenced numeric format repair, provided the other two
values are independently supported. Structural errors, missing IDs, and accepted duplicates never reach the API.

### Missing construction year and neighborhood

Lookup prompts include the entire original/prepared row, specifically city,
street, `total_floors`, `size_sqm`, `rooms`, `has_elevator`, `has_parking`,
`has_balcony`, and `has_safe_room`. These features guide the search but do not
independently establish an exact year. A safe room, for example, can be added to
an older building. The lookup prompt in `lookupPrompt.ts` requires web search
before returning `unknown` for an unresolved missing year or neighborhood. Missing
years use city, street, construction-year terms, and the property context; missing
neighborhoods require a city/street neighborhood search, preferably using municipal
maps or records. When both fields are missing, both must be investigated; failing
to recover one does not skip the other. `unknown` is returned only when the search
does not produce usable, unambiguous evidence for that field. The code-level
fallback for unavailable services or exhausted deadlines still applies.

The row's `source` value also guides searches for both missing facts. For example,
`רשות המיסים` / `רשות המסים` directs the model to search the named authority's
records together with the city and street before trying other authoritative
sources. The provider label is a search hint, not evidence by itself. The saved
row's original source is preserved even if another provider supplies the proof.

Only batches containing a missing year or neighborhood enable Anthropic's
`web_search_20250305` server tool, capped at **two searches per request**. Ordinary
format/date repairs continue using structured JSON without web search. Lookup
responses are parsed and checked as JSON in code because web-search citations
cannot be combined with Anthropic's strict `output_config` format. Search costs
and token charges are additional provider usage; logs include actual search counts.
No searches are made during automated tests.

Format/date repairs run first and never share a request with source lookups.
Eligible lookup identities are deferred to a second streaming pass over the same
read-only CSV, after the ordinary repair queue is flushed. No raw-row backlog is
kept in memory. Later occurrences of deferred identities are processed in that
pass too, preserving first-valid duplicate behavior. Source lookups have their own
API budget; a lookup failure cannot cancel already completed
date repairs. Input totals and rejected records are counted once, and the final
summary includes both passes. The ordinary batch progress logs describe the first pass.

The CSV has no building numbers or coordinates, so a source about one specific
building cannot identify this property. A missing neighborhood is accepted only
when a cited source explicitly covers the entire named street in the named city.
A numeric construction year requires an explicit statement that all buildings on
that street were built in that exact year. Approximate eras, feature-based guesses,
negated statements, unsupported quotations/URLs, and conflicting answers are not
accepted. Consequently, many year lookups may correctly remain `unknown`.

The internal lookup response includes `lookup_evidence` with identity, `source`, field,
value, source URL, exact cited quote, and scope. URLs must appear in actual search
results and quotations must appear in the API's web-search citations. The evidence
must match the city, street, and proposed value. Each evidence item's `source`
must match the submitted row's source after trimming; this provider label is
retained in verified facts and repair logs. `source_url` remains the retrieved
supporting webpage and may belong to another provider. Ordinary four-key repair reports
remain in the same response envelope. The accepted `Deal.year_built` type is
`number | 'unknown'`; unknown neighborhoods use the string `unknown`.

A lookup may return `year_built: "unknown"` or `neighborhood: "unknown"` and retain
the row. When credentials are missing, the request times out, the budget runs out,
the response is malformed, or no verified answer is provided, code defaults only
the missing lookup fields to `unknown` and independently validates the remaining
row. An unsupported model guess is discarded. Provided valid fields remain intact;
malformed nonempty construction years are not replaced by unknown. Unknowns from
code fallback are counted as code corrections and logged separately from verified
model corrections. The frontend displays `unknown` as `לא ידוע`.
All valid source fields, defaults, duplicate checks, and other validation remain
in force. Accepted lookup sources are included in structured repair logs.

### Deadlines and fallback

- CSV loading runs independently of Fastify's startup hooks, so long imports do
  not delay HTTP readiness. Data endpoints report processing until completion.
  Provider deadlines below remain in force.
- Each format request has a **10-second hard deadline**; source lookup requests
  have a **30-second hard deadline**, including streaming to
  completion. A first token does not restart that deadline. The request is aborted
  on timeout; incomplete JSON is never accepted.
- Format requests have a **30-second cumulative API-work budget per import**;
  source lookups have a separate **120-second budget**, measured with a monotonic
  clock. Each final request receives only the remaining time in its own budget.
  Local CSV parsing time is not part of this API-work budget.
- SDK retries and extended thinking are disabled. A service error, authentication
  failure, rate limit, or timeout disables further calls of that request type for
  the import. Missing lookup fields still receive the safe `unknown` fallback.
- Invalid or truncated responses fail their group without retries; later groups
  may still run within the remaining budget.
- Valid and code-corrected deals remain usable when Anthropic is unavailable.
  The import fails if there are no acceptable deals, or the CSV itself cannot
  be parsed reliably. The app exposes its collection only after import completes.

Structured logs distinguish code field corrections, verified LLM corrections,
rejected rows, API request duration/token usage, and original/code/LLM acceptance
counts. Service failure logs include request type (`format` or `lookup`), elapsed
time, cancellation status, and HTTP status when available, without provider
error bodies or credentials. A sample-file regression test simulates a failed
lookup and failed city translations and verifies **503 accepted / 27 rejected** with explicit unknown values;
actual live counts still depend on model responses and deadlines.
Backend tests mock the SDK and transport; no paid API calls are made during
verification.
