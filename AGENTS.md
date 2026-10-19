# Project rules

These rules apply to the entire project.

1. **Hebrew and RTL are the product's native condition.** Build user-facing content in Hebrew and use right-to-left layouts by default.
2. **Do not state things the data does not support.** Ground claims in available data, make uncertainty and missing information explicit, and never invent facts or conclusions.
3. **The product must survive the model being slow, wrong, or unavailable.** Handle timeouts, validate model outputs, and provide useful fallback behavior and clear error states so core functionality remains usable.
4. **Use Tailwind CSS for UI styling.**
5. **Do not edit the CSV file itself.** Treat source CSV files as read-only; perform any cleaning, transformation, or derived calculations in code or separate output files.
6. **Use TypeScript throughout the entire project.** Write frontend, backend, shared code, scripts, and tests in TypeScript (`.ts` or `.tsx`), with strict type checking enabled. Use TypeScript for configuration files wherever the tool supports it. Do not introduce JavaScript source files.
7. **Maintain at least 80% unit test coverage.** Apply this minimum to lines, branches, functions, and statements in frontend, backend, and shared application code. Include untested source files in coverage reports, and enforce these thresholds in the coverage test command and CI. Write meaningful tests for expected behavior, edge cases, and failure paths; do not exclude application code merely to meet the threshold.
8. **Split frontend code into focused components in separate files.** Give each React component its own `.tsx` file with a clear responsibility and typed props. Keep `App.tsx` focused on composing components. Place shared types, mock data, utilities, and reusable hooks in separate `.ts` files rather than embedding them in page components.
