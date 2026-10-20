# Deal analysis API

`GET /deals/:row_id/analysis` analyzes a parsed, accepted deal. Obtain its `row_id`
from `/deals`, then request, for example:

```sh
curl http://127.0.0.1:3000/deals/row-2/analysis
```

Successful responses contain exactly four fields (illustrative values):

```json
{
  "valuation_assessment": "Undervalued",
  "estimated_discount_premium_pct": -12,
  "key_strengths": ["מחיר העסקה למ״ר נמוך ב־12% מממוצע 3 עסקאות אחרות מאותו סוג נכס ברחוב בנתונים שנקלטו."],
  "risk_factors": ["ההשוואה מבוססת על הנתונים שנקלטו בלבד ואינה קובעת את שווי השוק הנוכחי."]
}
```

Keys and assessment values remain English; explanations are Hebrew. No analysis
UI is included. The source CSV and import counts are unchanged.

## Eligibility and comparisons

Only accepted rows and their repaired values are used. There is no external research.
Street and neighborhood are unknown when absent, blank after trimming, or equal
to `unknown`, case-insensitively. When **both** are unknown, return
`{"status":"unavailable"}` before comparison selection, cache access, or LLM work.
This endpoint rule does not change CSV import eligibility.

Exclude the target row by `row_id`. Compare only the same city and property type.
Choose the narrowest group containing at least three other rows: known street,
then known neighborhood, then city. City fallback is allowed when a local field is
known but local groups are too small. Summaries include group counts, arithmetic
(not size-weighted) mean prices per sqm, and transaction date ranges.

TypeScript calculates `(target price_per_sqm / baseline average - 1) * 100`, rounded
to two decimals. Negative means discount; positive means premium. Classify the
rounded percentage: below -5 is `Undervalued`, -5 through +5 inclusive is
`Fairly Priced`, and above +5 is `Overpriced`.

All accepted transaction dates are included without outlier removal, time or
property-feature adjustments, or fuzzy location matching. Explicit city aliases
and typography variants use the same canonical city identity as the dropdowns;
original deal fields remain unchanged. The result compares
this dataset's averages; it does not establish current market value.

## Grounding and failure behavior

The supplied real-estate-agent prompt is preserved with grounding instructions.
The existing Anthropic model receives all saved target fields, repair metadata,
available location summaries, computed assessment/percentage, and factual Hebrew
evidence statements. The model selects and prioritizes strengths and risks from
that catalog. Verification requires exact evidence membership, no duplicate
statements, matching calculations, and the dataset limitation in `risk_factors`.
Renovation history, defects, and other absent facts cannot be introduced.

| Situation | HTTP status | Response |
| --- | --- | --- |
| Valid analysis | 200 | The four fields above |
| Ineligible deal, insufficient comparables, missing credentials, provider failure, timeout, or invalid output | 200 | `{"status":"unavailable"}` |
| Malformed row ID | 400 | Hebrew `error` |
| Unknown or excluded row | 404 | Hebrew `error` |
| Import processing | 202 | Existing processing body and `Retry-After: 2` |
| Import failed | 503 | Existing Hebrew import error |

Row IDs use logical CSV record numbers, with the header as record 1; embedded
newlines do not create records. IDs are stable for unchanged source files, not
global identifiers across different or reordered datasets.

## Deadlines, caching, and configuration

Reuse `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`. Tests inject `analysisTransport`
and do not require paid requests. The overall deadline is **10 seconds**, including
cache work and complete streamed model output. Abort signals propagate to the
provider; ignored cancellation and late results are discarded. SDK retries and
thinking are disabled; output is capped at 2,048 tokens. Analysis failures do not
disable existing data endpoints.

Validated successes are cached for **five minutes** in memory and optional Redis.
Keys include the accepted dataset fingerprint, row ID, model, and policy version.
Redis hits are revalidated and carry an absolute expiry, so promotion to memory
does not extend freshness. Concurrent requests for one row share a task;
unavailable results are not cached. Cache reads/writes each have a 200 ms deadline
within the overall request budget. Redis failure falls back to analysis or the
validated result. Missing credentials return unavailable even if Redis exists.
HTTP responses use `Cache-Control: no-store`; caching is server-side.

Logs record outcome, comparison scope/count, elapsed time, and actual token usage
when available, without credentials or provider error bodies. Increment the
analysis policy version when changing comparison or evidence rules.
