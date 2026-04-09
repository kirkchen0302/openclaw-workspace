# Deploy environment name incident — 2026-04-09

## Summary
GitHub Actions for `invoice-prototype` failed at **Deploy to Firebase Hosting** after the workflow environment name was changed from `INVOICE-BFD85` to `PM_PROTOTYPE_A75CE`.

## Root cause
The Firebase project and deployment target were still correct (`pm-prototype-a75ce`).
The failure was caused by a **GitHub Environment name mismatch**:

- Workflow used: `PM_PROTOTYPE_A75CE`
- Actual GitHub Environment containing required secrets: `INVOICE-BFD85`

Because GitHub Actions reads environment-scoped secrets from the exact environment name specified in the workflow, the deploy step could not access the Firebase credentials.

## Affected secrets
These secrets were expected in the workflow environment:

- `PM_PROTOTYPE_FIREBASE_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_PM_PROTOTYPE`

They existed under `INVOICE-BFD85`, not `PM_PROTOTYPE_A75CE`.

## Fix applied
Reverted workflow environment back to:

```yml
environment: INVOICE-BFD85
```

## Important note
`INVOICE-BFD85` is **only a GitHub Environment label**.
It does **not** mean deployment is going to the old Firebase project.
Actual deployment still targets:

- Firebase project: `pm-prototype-a75ce`
- Hosting site: `pm-prototype-a75ce`

## Prevention
Before renaming a workflow `environment:` value:

1. Verify the exact GitHub Environment name in repo settings
2. Confirm all required secrets exist in the target environment
3. If only the label is changing, migrate secrets first
4. Do not assume repo-level or other environment secrets will be available

## Recommendation
Keep using `INVOICE-BFD85` for now unless there is a deliberate migration plan to rename the GitHub Environment and move all secrets together.
