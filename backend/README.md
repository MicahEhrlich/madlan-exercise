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
```

- `ANTHROPIC_API_KEY`: enables Anthropic repair during import. When missing or blank,
  LLM repair is skipped; code corrections still run. Credentials are never logged.
- `BATCH_SIZE`: defaults to 1,000 when missing or blank. A supplied value must be
  a positive safe integer or startup fails.
- `CSV_FILE_PATH`: defaults to the existing root CSV when missing or blank.
  Relative paths resolve from `backend/`; absolute paths are supported. Quote paths
  containing spaces in `.env`.
- `LLM_BATCH_SIZE`: defaults to 5, independently of CSV `BATCH_SIZE`. Must be a
  positive safe integer. The output-token estimate can reduce the effective size.
- `ANTHROPIC_MODEL`: defaults to `claude-haiku-4-5-20251001`.

## Startup CSV loading

Before accepting requests, the server reads
`../madlan_deals_sample (3) (2) (1) (1).csv`. The location is resolved relative to
the loader module, so it works from any working directory in development and
after compilation. Keep the root CSV available alongside the backend when
deploying. The file is never modified.

Accepted deals are available internally as `app.deals`, a typed, frozen array of
frozen objects. Loading happens once per server instance; updates require a
restart. There is no deals endpoint, database, or frontend integration yet.

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
CSV record numbering continue across batch boundaries. A failed import prevents
startup, and the app never exposes a partially imported collection.

Raw CSV parsing memory is limited to a batch plus stream/parser buffers and the
current record. Accepted deals, their duplicate-identity index, and identities
deferred for source lookup remain in memory, so total memory grows with those sets. Batching does not make
an arbitrarily large accepted dataset fit in RAM; no files or database are used
to persist batches locally.

### Normalization and rejection rules

- All 19 expected columns must be present exactly once; extra columns are rejected.
  Header order may vary. UTF-8 BOM, quoted commas/newlines, and empty lines are supported.
- Surrounding whitespace is trimmed; text and city aliases are preserved without
  translation or inferred equivalences. Missing `condition` and `floor` default to
  the literal `unknown`; missing `has_parking` defaults to `false` by application
  policy. Defaults are logged with `kind: "default"`, rather than treated as observed
  property facts. Nonempty malformed floor or parking values are not defaulted.
  Other fields remain required unless a financial value can be derived below.
- Boolean amenities accept `כן/לא`, `yes/no`, `true/false`, and `1/0`.
  English values are case-insensitive.
- Numeric values accept complete numbers and correctly grouped thousands separators.
  Prices may start with `₪`; rooms may have a trailing `חדרים`.
- Rooms, size, and prices must be positive finite numbers. A known floor must be
  a nonnegative integer and cannot exceed the building's total floors; `unknown`
  is also accepted for the property floor. Total floors must remain a nonnegative
  integer. Construction year must be a positive integer. No market-price limits
  or statistical outlier filters are applied.
- Dates must be real, exact calendar dates in `YYYY-MM-DD`, `DD/MM/YYYY`, or
  `DD.MM.YYYY` format and are stored as `YYYY-MM-DD`. Other supported formats are
  eligible for LLM repair only if every other row error is also repairable. For
  month/year values such as `Aug 2025`, the LLM must return `2025-08-01`, using the
  explicitly configured day-01 default. Missing years/months and impossible dates
  are not guessed. Without LLM repair, month-only values remain rejected.
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
syntax, and files with no valid deals prevent startup. Rows with incorrect field
counts are logged and skipped when the parser can safely continue.

### Sample CSV verification

With LLM repair disabled, the supplied file contains **530 records: 447 accepted,
83 rejected**, with 447 unique accepted IDs. Of the accepted rows, 381 pass original
validation and 66 are accepted after code corrections/defaults. These rules recover
45 more rows than the previous 402/128 result. Live LLM results are not assumed or
recorded as verified until responses pass the backend checks. This sample has no
repeated IDs at differing cities or streets, so the address-aware duplicate policy
does not change its totals.

Remaining rejection reasons include missing construction year or neighborhood,
month-only dates, insufficient financial operands, and duplicate ID/address
combinations. A row can have several reasons, so reason counts should not be summed
to obtain the number of rejected records.

## Anthropic repair

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
accepting a model proposal. Missing construction year or neighborhood requires the
source lookup described below; these facts cannot be guessed.
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
an older building. The supplied missing-year prompt is preserved in `lookupPrompt.ts`.

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
pass too, preserving first-valid duplicate behavior. Source lookups use only the
remaining shared API budget; a lookup failure cannot cancel already completed
date repairs. Input totals and rejected records are counted once, and the final
summary includes both passes. The ordinary batch progress logs describe the first pass.

The CSV has no building numbers or coordinates, so a source about one specific
building cannot identify this property. A missing neighborhood is accepted only
when a cited source explicitly covers the entire named street in the named city.
A numeric construction year requires an explicit statement that all buildings on
that street were built in that exact year. Approximate eras, feature-based guesses,
negated statements, unsupported quotations/URLs, and conflicting answers are not
accepted. Consequently, many year lookups may correctly remain `unknown`.

The internal lookup response includes `lookup_evidence` with identity, field,
value, source URL, exact cited quote, and scope. URLs must appear in actual search
results and quotations must appear in the API's web-search citations. The evidence
must match the city, street, and proposed value. Ordinary four-key repair reports
and the accepted `Deal` shape remain unchanged.

A lookup may return `year_built: "unknown"` (or an unknown neighborhood) in its
internal response; code reclassifies that original row as failed and excludes it
from `app.deals`. The accepted dataset still requires a numeric construction year.
All valid source fields, defaults, duplicate checks, and other validation remain
in force. Accepted lookup sources are included in structured repair logs.

### Deadlines and fallback

- Fastify's plugin/startup-hook timeout is disabled by default because streaming
  the CSV and performing several bounded repairs can exceed its default 10 seconds.
  Readiness still waits for the completed import, and import errors still prevent
  startup. This does not disable the API deadlines below. Programmatic callers can
  explicitly override `pluginTimeout` in `buildApp` if needed.
- Each entire request has a **10-second hard deadline**, including streaming to
  completion. A first token does not restart that deadline. The request is aborted
  on timeout; incomplete JSON is never accepted.
- All requests share a **30-second cumulative API-work budget per import**, measured
  with a monotonic clock. The final request receives only the remaining time.
  Local CSV parsing time is not part of this API-work budget.
- SDK retries and extended thinking are disabled. A service error, authentication
  failure, rate limit, or timeout disables further API calls for the import.
- Invalid or truncated responses fail their group without retries; later groups
  may still run within the remaining budget.
- Valid and code-corrected deals remain usable when Anthropic is unavailable.
  Startup still fails if there are no acceptable deals, or the CSV itself cannot
  be parsed reliably. The app exposes its collection only after import completes.

Structured logs distinguish code field corrections, verified LLM corrections,
rejected rows, API request duration/token usage, and original/code/LLM acceptance
counts. Service failure logs include request type (`format` or `lookup`), elapsed
time, cancellation status, and HTTP status when available, without provider
error bodies or credentials. A sample-file regression test simulates 15 successful
date repairs followed by a failed lookup and verifies **462 accepted / 68 rejected**;
actual live counts still depend on model responses and deadlines.
Backend tests mock the SDK and transport; no paid API calls are made during
verification. There are no new HTTP endpoints or frontend changes.
