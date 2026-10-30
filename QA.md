# QA — 29 October 2026

- Node syntax check: passed.
- Backend automated suite: 6/6 passed (contact validation/storage failures, MongoDB readiness, private paths, configuration isolation, local links/assets, and distinct source-backed NEXZO evidence).
- `/api/health`: returned `ok: true`, contact storage mode `local`.
- Invalid contact submission: returned HTTP 400; no contact record was created.
- Browser console and uncaught errors: 0.
- Earlier layout pass: browser widths 360, 390, 430, 768, 1024, 1440, 1724, and 1920 px matched document width. NEXZO text and feature rail stayed within section bounds at 1724 and 1920 px. Authenticity-pass browser check at 1536 px also has no horizontal overflow. Repeating all viewport sizes after these changes remains pending: browser viewport/screenshot control lost its tab attachment during QA.
- Navigation: mobile menu opens, closes after selecting a section, and section anchor settles below the fixed header.
- NEXZO selector: all eight actual product captures loaded; feature selections update description, counter, metadata and source links. Previous/next, component-scoped Arrow keys and native button Enter/Space remain available. Adjacent images preload; image decoding completes before the fixed-size frame crossfades in depth. No autoplay. Initial setup does not scroll the document.
- Case studies: modal opens with a project URL fragment; Escape and browser Back close it and restore focus; the URL clears.
- Resume: `/assets/resume/Rudra-Sharma-Resume.pdf` returned HTTP 200 (`application/pdf`) and downloaded as `Rudra-Sharma-Resume.pdf`. The one-page PDF rendered and its text matched the original Word document. The exact uploaded DOCX is also preserved at `assets/resume/Rudra-Sharma-Resume.docx`.
- Reduced motion: product transform computes to `none`; scrollbar style is `none` while regular scrolling remains available.
- Local contact submission was not sent during this pass; only invalid-data validation was exercised. Firebase/MongoDB live writes were not exercised because no separate deployment credentials are configured.
- NEXZO Firebase services/configuration were not accessed or modified.
- Render Blueprint uses the Node service with Atlas mode, an HTTP health check, and a dashboard-only `MONGODB_URI` secret. Production health now returns 503 until MongoDB is reachable.

## Release boundary

The separate Atlas/Render setup is prepared. Actual MONGODB_URI entry in Render remains an owner action. Public website, database connectivity, production contact write and production responsive/console QA are not yet verified. No successful deployment is claimed.

## Real portrait integration — 30 October 2026

- Replaced the obsolete image-tool portrait with the exact newly uploaded photograph; its untouched original and SHA-256 are preserved in `assets/portraits/SOURCE.md`.
- Verified original RGB preservation and visible-pixel equality through full-size lossless WebP encoding. Only the alpha mask, crop and proportional mobile resizing change.
- Desktop portrait is 38% larger than the preceding full-body composition, with lower legs cropped. The giant RS/background frames were removed; two fine lines, restrained warm light and a soft shadow remain.
- Visually compared local browser layouts at 1920×1080, 1440×900, 1366×768, 768×1024, 430×932 and 390×844. No horizontal overflow; face/navigation clearance and name readability checked. Mobile selects the smaller upper-body WebP rather than the 3.4 MB original.
- Local browser warning/error log: empty. Node syntax and all six existing tests passed. Public production verification is still pending the deployment credential handoff described above.

## Authenticity pass

- Eight real NEXZO application captures and their source/crop provenance are in `assets/nexzo-evidence/SOURCES.md`.
- Removed reconstructed NEXZO images and internal version branding from portfolio UI/API metadata.
- Removed the unused placeholder resume HTML; the actual DOCX and verified PDF remain.
- Replaced InsightHub/GamePro previews with real application crops excluding sample readership and seeded player-level values.
- Source-backed NEXZO case study now includes personalization feedback, actual data flow, implementation decisions and limitations. No invented user counts or benchmarks.
- Browser console returned no warning/error entries during local feature and case-study checks. Public checks remain pending.

