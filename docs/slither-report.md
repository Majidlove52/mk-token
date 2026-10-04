# Slither Report Template

This document is a blank recording template, not a report of completed analysis. Do not treat an empty table as a clean Slither result. Run the tool against the exact commit intended for review and record every finding, disposition, and justification.

## Run Locally

Install Slither and its supported Solidity toolchain using the project's security tooling instructions, then from the repository root:

```sh
npm ci
npm run compile
slither . --config-file slither.config.json
```

The checked-in config filters dependency and mock paths and omits low and informational impact output. Review the complete tool output and configuration before relying on filtered results; do not suppress unresolved high/medium findings.

## Manual GitHub Workflow

1. Open **Actions** in the repository.
2. Select the existing **Slither** workflow.
3. Select **Run workflow** on the branch under review.
4. Save the full workflow log and run metadata with the audit evidence.
5. Add each finding and its reviewed status to the table below. The workflow definition is in `.github/workflows/slither.yml` and is manually dispatched.

## Findings

No findings are asserted here. Populate this table only after an actual Slither run.

| Finding | Severity | Status | Justification |
| --- | --- | --- | --- |