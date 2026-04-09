# Deployment sanity checklist

Use this before changing `invoice-prototype` deployment flow.

## GitHub Secrets Source
- Workflow now reads **repository-level Actions secrets** directly
- Actual Firebase deploy target remains: `pm-prototype-a75ce`
- Current required repository secrets:
  - `PM_PROTOTYPE_FIREBASE_API_KEY`
  - `FIREBASE_SERVICE_ACCOUNT_PM_PROTOTYPE`

## Build / deploy invariants
- React app reads Firebase key from `VITE_FIREBASE_API_KEY`
- Static dashboard HTML files start with `__FIREBASE_API_KEY__` placeholder in source
- Deploy preparation must replace that placeholder in built dashboard files before publish
- If any file in `invoice-prototype/dist` still contains `__FIREBASE_API_KEY__`, deploy must fail

## Canonical deploy flow
1. Inject `VITE_FIREBASE_API_KEY`
2. Run `scripts/prepare_invoice_prototype_deploy.sh`
3. Deploy Firebase Hosting

## Known pitfall
If Firebase Hosting serves a dashboard page still containing `__FIREBASE_API_KEY__`, login will fail with `auth/api-key-not-valid`.
