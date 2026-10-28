# Rudra Sharma Portfolio — Production Deployment Handover

Repository: https://github.com/Rudra-801/rudra-sharma-portfolio
Primary owner/contact email: rudrasharma92004@gmail.com
Branch: main
Latest deployment-preparation commit: 67d0b66
Status: Source pushed and Render configuration prepared. Public deployment is pending Render login and MongoDB Atlas configuration.

## Completed

- Current approved portfolio design preserved and polished.
- Actual uploaded resume preserved as DOCX and converted to PDF.
- Resume download verified through the running application.
- Responsive widths from 360 to 1920 px checked with no horizontal overflow.
- Navigation, feature controls, case-study history and reduced motion checked.
- Browser console reported no errors during QA.
- Backend tests: 5 passed; syntax checks passed.
- Source committed and pushed to main.
- Secrets, .env files and contact records excluded from Git.

## Production services required

1. Render Node/Express Web Service: serves the portfolio and contact API together.
2. Separate MongoDB Atlas database: persists contact form submissions.
3. Optional custom domain after the initial Render URL is live.

Static hosting alone cannot run the contact API. No NEXZO Firebase services or configuration are required for this deployment.

## Render settings

Repository: Rudra-801/rudra-sharma-portfolio
Primary owner/contact email: rudrasharma92004@gmail.com
Branch: main
Runtime: Node
Root directory: leave empty (repository root)
Build command: npm ci
Start command: npm start
Health check path: /api/health

The repository contains render.yaml with these settings.

Environment variables:

| Name | Value |
| --- | --- |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| CONTACT_STORE | mongodb |
| MONGODB_URI | Actual Atlas connection string, entered only in Render's environment settings |

Render supplies PORT automatically. Do not commit a URI or credentials to GitHub. Do not send credentials in chat.

## Remaining steps

1. Complete sign-in at https://dashboard.render.com using your Render account. The browser was left at the sign-in screen.
2. Create or select a separate Atlas database for this portfolio and a database user limited to that database.
3. Configure Atlas Network Access for the Render service's outbound IP addresses.
4. Add the actual Atlas URI to Render as MONGODB_URI. Do not use a placeholder value.
5. Create the Render Web Service using the repository or its Blueprint.
6. Wait for a successful deploy and healthy /api/health response.
7. Open the actual Render-assigned public URL. The desired name rudra-sharma-portfolio.onrender.com is not reserved or verified yet.
8. Verify desktop/mobile layout, resume download, project links and a real contact submission on that URL. Confirm the submission is stored in Atlas.
9. After public QA succeeds, configure the chosen custom domain, DNS and HTTPS, and update canonical/social metadata to the final URL.

## Deployment acceptance checks

- Public URL loads over HTTPS.
- /api/health returns HTTP 200 and contactStorage mongodb.
- Resume PDF downloads correctly.
- Contact form successfully persists a message in Atlas.
- No missing local assets or uncaught JavaScript errors.
- Navigation and project controls work on desktop and mobile.
- No NEXZO project or configuration has been changed.

Deployment must not be called complete until these checks pass on the public service.

## Local run

From C:\Users\Rudra\OneDrive\Desktop\Portfolio:

    npm ci
    npm start

Open http://127.0.0.1:5500/

Verification:

    npm run check
    npm test

## Important files

- render.yaml — Render service definition
- backend/server.js — Express entry point and readiness health check
- backend/contact-store.js — contact storage adapters
- assets/resume/Rudra-Sharma-Resume.pdf — actual resume PDF
- assets/resume/Rudra-Sharma-Resume.docx — original uploaded resume
- QA.md — recorded QA results

Reference documentation:
https://render.com/docs/blueprint-spec
https://render.com/docs/health-checks
https://www.mongodb.com/docs/atlas/security/ip-access-list/
