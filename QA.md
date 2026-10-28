# QA — 28 October 2026

- Node syntax check: passed.
- Backend automated suite: 4/4 passed (contact validation/storage failures, private paths, configuration isolation, and local links/assets).
- `/api/health`: returned `ok: true`, contact storage mode `local`.
- Invalid contact submission: returned HTTP 400; no contact record was created.
- Browser console and uncaught errors: 0.
- Responsive browser widths checked: 360, 390, 430, 768, 1024, 1440, 1724, and 1920 px; document width matched viewport at each size. NEXZO text and feature rail stayed within the section bounds at 1724 and 1920 px.
- Navigation: mobile menu opens, closes after selecting a section, and section anchor settles below the fixed header.
- NEXZO selector: next/previous and Arrow keys update selected row, description, counter, browser label, and alternate bundled interface screenshot. Initial feature setup does not scroll the page.
- Case studies: modal opens with a project URL fragment; Escape and browser Back close it and restore focus; the URL clears.
- Resume: `/assets/resume/Rudra-Sharma-Resume.pdf` returned HTTP 200 (`application/pdf`) and downloaded as `Rudra-Sharma-Resume.pdf`. The one-page PDF rendered and its text matched the original Word document. The exact uploaded DOCX is also preserved at `assets/resume/Rudra-Sharma-Resume.docx`.
- Reduced motion: product transform computes to `none`; scrollbar style is `none` while regular scrolling remains available.
- Local contact submission was not sent during this pass; only invalid-data validation was exercised. Firebase/MongoDB live writes were not exercised because no separate deployment credentials are configured.
- NEXZO Firebase services/configuration were not accessed or modified.

## Release boundary

This remains a local-ready portfolio with its isolated contact backend. Configure a separate portfolio deployment and its own contact storage credentials when ready. No Firebase deployment was performed.

