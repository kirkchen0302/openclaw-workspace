# Deploy environment name incident — 2026-04-09

## Summary
GitHub Actions for `invoice-prototype` first failed because the workflow environment name was changed away from the actual GitHub Environment holding secrets. After that mismatch was corrected, the workflow still could not read environment-scoped secrets reliably in the deploy job.

## Root cause
There were two separate problems in sequence:

1. **GitHub Environment name mismatch**
   - Workflow used `PM_PROTOTYPE_A75CE`
   - Existing GitHub Environment holding secrets used a legacy name (`INVOICE_BFD85` / earlier confusion also involved `INVOICE-BFD85`)

2. **Environment-scoped secrets still resolved as missing inside Actions job**
   - Even after correcting the visible environment naming, workflow diagnostics showed:
     - `PM_PROTOTYPE_FIREBASE_API_KEY=missing`
     - `FIREBASE_SERVICE_ACCOUNT_PM_PROTOTYPE=missing`
   - This blocked deploy before Firebase Hosting upload.

## Affected secrets
- `PM_PROTOTYPE_FIREBASE_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_PM_PROTOTYPE`

## Final fix direction
The deploy workflow was simplified to use **repository-level GitHub Actions secrets directly** instead of relying on GitHub Environment-scoped secrets.

This avoids repeated scope mismatches and makes the deploy path easier to reason about.

## Important note
This incident was about **GitHub secret scoping**, not Firebase project targeting.
Actual deployment target remains:

- Firebase project: `pm-prototype-a75ce`
- Hosting site: `pm-prototype-a75ce`

## Prevention
1. Keep deploy secret sourcing simple
2. Prefer repository-level Actions secrets unless environment-scoped separation is truly needed
3. Keep a diagnostics step that prints only `present/missing`
4. Fail deploy if dashboard build output still contains `__FIREBASE_API_KEY__`

## Recommendation
Use repository-level Actions secrets for `invoice-prototype` deploys unless there is a strong operational reason to reintroduce environment-scoped secrets later.
