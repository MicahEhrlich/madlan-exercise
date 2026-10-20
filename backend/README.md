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
```

- `ANTHROPIC_API_KEY`: optional until an AI feature needs it; no API call is made
  during startup and the key is never logged.
- `BATCH_SIZE`: defaults to 1,000 when missing or blank. A supplied value must be
  a positive safe integer or startup fails.
- `CSV_FILE_PATH`: defaults to the existing root CSV when missing or blank.
  Relative paths resolve from `backend/`; absolute paths are supported. Quote paths
  containing spaces in `.env`.

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
accepted deals in that batch, and cumulative input count. Duplicate detection and
CSV record numbering continue across batch boundaries. A failed import prevents
startup, and the app never exposes a partially imported collection.

Raw CSV parsing memory is limited to a batch plus stream/parser buffers and the
current record. As requested, accepted deals and their duplicate-ID index remain
in memory, so total memory still grows with accepted data. Batching does not make
an arbitrarily large accepted dataset fit in RAM; no files or database are used
to persist batches locally.

### Normalization and rejection rules

- All 19 expected columns must be present exactly once; extra columns are rejected.
  Header order may vary. UTF-8 BOM, quoted commas/newlines, and empty lines are supported.
- Every field is required. Surrounding whitespace is trimmed; text and city aliases
  are preserved without translation or inferred equivalences.
- Boolean amenities accept `כן/לא`, `yes/no`, `true/false`, and `1/0`.
  English values are case-insensitive.
- Numeric values accept complete numbers and correctly grouped thousands separators.
  Prices may start with `₪`; rooms may have a trailing `חדרים`.
- Rooms, size, and prices must be positive finite numbers. Floors must be
  nonnegative integers, and the property floor cannot exceed the building's total
  floors. Construction year must be a positive integer. No market-price limits
  or statistical outlier filters are applied.
- Dates must be real, exact calendar dates in `YYYY-MM-DD`, `DD/MM/YYYY`, or
  `DD.MM.YYYY` format and are stored as `YYYY-MM-DD`. Month-only dates are rejected;
  no day is invented.
- The supplied unit price must differ from `price_nis / size_sqm` by at most
  1 NIS/m². Inconsistent prices are rejected rather than overwritten.
- The first valid row for a trimmed deal ID wins. Later occurrences are rejected;
  an invalid row does not reserve its ID.

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

The supplied file contains **530 records: 382 accepted, 148 rejected**, with
382 unique accepted IDs. Rejection reasons include missing fields, month-only
dates, nonpositive prices, inconsistent unit prices, and duplicate IDs. A row can
have several reasons, so reason counts should not be summed to obtain the number
of rejected records.
