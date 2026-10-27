# NEXZO deployment and release gates

Work from Project Phase-1. Firebase Hosting serves `dist`; local development serves `Frontend`. Keep the existing Render service and Firebase project. Do not use the main Level 100 account for tests.

## Verification before deployment

```powershell
npm ci --prefix Backend
npm ci --prefix tools/firebase-tests
python tools/build_production.py
python tools/full_verify.py
npm --prefix Backend run test:integration
python tools/predeploy_check.py
```

For local persistence/rules tests, install Firebase CLI and Java 21, then start emulators in a separate terminal:

```powershell
firebase emulators:start --config firebase.emulator.json --project demo-nexzo-release --only auth,firestore
node --test tools/academic_persistence_emulator_tests.mjs
```

The persistence runner is hard guarded to local demo emulators. Its AI responses are controlled fixtures, not a live provider test. Before deploying, use two verified disposable non-admin accounts to test actual MCQ generation/evaluation, subjective evaluation, task/receipt reload and re-login, another-device isolation, and Assistant streaming. Emulator success does not replace these live gates.

## Render backend

The existing Render service was manually deployed, within the approved backend validation scope, to `f3686a064ba2dd947d62a8f8868e2156c4d96697` from `release/academic-backend-v269` on 2026-10-11 (local time). Render deployment `dep-db594bcs728c73c9fmp0` reported successful and live; production `/api/health` reported `evaluationContract: 2` and `deterministicMcq: true`, and `/ready` succeeded. Authenticated live provider, Planner and persistence gates remain UNVERIFIED: the last verified test identity was protected, and the auth-only tab could not be inspected in the current browser session. No production test writes were performed. Firebase Hosting and production rules have not been deployed. The preceding tested backend deployment was `d36aa2fa2cfdadffc834736dd380ed2927738d27`.

The GitHub `main` branch still contains the older backend. Do not use “Deploy latest commit” until the reviewed release changes have been integrated into that branch. Auto-Deploy remains disabled. The previous live rollback target was `c0c22ef0469f1be2eb1237951bc23654c14c11cf`.

Deploy the tested commit to the existing service only after live release gates pass. Root directory: `Backend`; build: `npm ci --omit=dev`; start: `npm start`; readiness check: `/ready`. Use Node 24 (`NODE_VERSION=24`), matching `render.yaml` and Docker. Firebase Admin now requires Node 22 or newer.

Required production variables: `NODE_ENV=production`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `ALLOWED_ORIGINS`, `GEMINI_API_KEY`. Set `GEMINI_MODEL` to a model actually available with quota in that Google project. Optional configured fallback: `OPENAI_API_KEY`, `OPENAI_MODEL`, `ACADEMIC_PRIMARY_PROVIDER=openai`; optionally `GEMINI_FALLBACK_MODELS` contains explicitly enabled alternatives. Existing non-academic modules still need Gemini. Store credential values only in Render secrets; never in frontend files or Git.

After backend deployment, `/api/health` must report `evaluationContract: 2`; `/ready` must succeed. A sleeping Render instance and provider quota are different failures. Code does not restore exhausted external quota: enable billing/available capacity or configure a legitimate secondary provider. MCQ marking bypasses AI, but generation outside the curated question bank and subjective marking still require a working provider.

## Firebase Hosting and rules

Rebuild fresh `dist` after the backend contract is available:

```powershell
python tools/build_production.py
python tools/predeploy_check.py
firebase deploy --project personalized-recommendersystem --only firestore:rules,hosting
```

This command is documentation, not deployment authorization. Rules must be deployed with the new backend: private question plans are server-only; evaluation receipts are owner-readable and server-writable. No destructive data migration is required. Existing tasks remain; legacy quizzes without a trusted private key need a new preview before grading. Existing public legacy keys are not accepted as grading evidence.

## Production smoke gates

With disposable accounts, verify Planner preview equals saved questions, MCQ result persists, duplicate submissions do not add XP, subjective failure preserves the answer without awards, retry works, refresh/re-login restores receipts, cross-user access is denied, and Assistant streams. Check Home, Academics, Career, Campus, Community, Dashboard, Hub, Settings and Profile navigation/layout at desktop and mobile widths. Never reset or recalculate the main account.

Offline curated notes cover selected topics, now including all eight topics of BEE-103 DC Circuits: R/L/C and sources, Kirchhoff laws, two-loop analysis, superposition, Thevenin, Norton, RL and RC transients. Frontend and backend share notes schema version 5. These topics bypass provider requests and AI quota reservations. Other canonical topics use validated provider generation with cache/retry; exhausted external quota still requires available provider capacity. Sanitized production diagnostics record only provider name, error code and status, without prompts or credentials. Coding tasks have test expectations but no existing sandbox execution service; do not describe AI code review as executed tests.

DC Circuits repair verification: backend unit tests 95/95, API integration tests 8/8, Auth/Firestore emulator tests 14/14, full verification 22/22 suites, structural pre-deployment check and production build passed. Emulator notes API calls returned all eight exact topics during a simulated provider quota failure without calling AI or creating evaluation/XP records. Browser checks opened all eight exact topics with curated content, checked the reported topic after reload, and checked notes layout at 1920, 1440, 1366 and 390px widths. Page width stayed within the viewport; long circuit schematics scroll inside their code block on mobile. Curriculum remained 155 courses, 601 units and 3,040 topics. These checks do not establish authenticated production persistence or live AI provider availability.

Academic references used to check the curated circuit explanations: [OpenStax Kirchhoff rules](https://openstax.org/books/university-physics-volume-2/pages/10-3-kirchhoffs-rules), [OpenStax RL circuits](https://openstax.org/books/university-physics-volume-2/pages/14-4-rl-circuits), [OpenStax RC circuits](https://openstax.org/books/university-physics-volume-2/pages/10-5-rc-circuits), and [MIT superposition, Thevenin and Norton lecture](https://ocw.mit.edu/courses/6-002-circuits-and-electronics-spring-2007/resources/lecture-3/). Worked numerical examples are calculated for this project.
