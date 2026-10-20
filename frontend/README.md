# React + TypeScript + Vite

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

Run the backend on `http://127.0.0.1:3000` and the frontend with `pnpm dev`.
Vite proxies `/deals` requests to the backend. In production, route `/deals` on
the frontend origin to the backend through your hosting reverse proxy.
Requests time out after 10 seconds; errors and invalid responses display a retry
action in Hebrew. Pending requests are cancelled when navigating or unmounting.

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
