# Product evidence provenance — 29 October 2026

All eight NEXZO images in this folder were captured directly from the live application at https://personalized-recommendersystem.web.app/ using the browser screenshot API. No UI was generated, reconstructed, retouched or populated for the portfolio. Only viewport cropping was applied. Desktop capture viewport: 1600 × 1000. Mobile capture viewport: 430 × 932.

| Highlight | File | Actual source | Capture crop (x, y, width, height) |
| --- | --- | --- | --- |
| Personalized Recommendations | recommendations.png | /academics.html — recommended next action and subject cards | 0, 320, 1600, 600 |
| Complete Student Ecosystem | home.png | / — Home with module navigation | full viewport |
| Academics & Career Guidance | academics.png | /academics.html — academic subject workflow, not a Career screenshot | 0, 150, 1600, 800 |
| Smart Planner & Evaluation | planner.png | /planner.html — existing Create New Task controls reached with Add Plan; no task submitted | 45, 245, 1510, 750 |
| Community | community.png | /community.html — existing composer; private group panel excluded | 80, 325, 1060, 675 |
| AI Study Assistant | assistant-tools.png | /ai-assistant.html — existing Study tools drawer; conversation excluded | 1160, 95, 425, 890 |
| Progress Tracking | progress.png | /dashboard.html — actual existing Planner-synced progress; account email/header excluded | 20, 175, 1560, 810 |
| Modern Responsive Interface | mobile-academics.png | /academics.html — actual mobile layout; account header excluded | 0, 280, 430, 652 |

The captured progress values are the application's existing rendered state. They are not portfolio usage/adoption metrics or fabricated achievements. No application data was edited, posted or created for these captures. Assistant control visibility is evidence of the interface, not proof that every external tool backend was executed successfully.

Removed portfolio assets: nexzo-real.png, nexzo-v4.png and nexzo.png. These contained an unverified reconstructed dashboard, internal version label and/or unsupported statistics. The carousel no longer uses a login screenshot or alternating generic mockups.

The InsightHub and GamePro preview files were recaptured from their actual bundled applications on the local portfolio server. InsightHub crop: 25,195,840,750 at 1600×1000; excludes sample readership numbers, issue label and decorative code illustration. GamePro crop: 250,85,1325,820 at 1600×1000; excludes the seeded player-level sidebar. The underlying applications were not changed.

## Case-study source evidence

- `projects/nexzo/Frontend/js/data-service.js`: task normalization, aggregate progress, task/profile update events, cloud-backed persistence and preservation of evaluation/reward state.
- `projects/nexzo/Frontend/js/personalization-engine-v152.js`: assessed-event mastery, recommendation feature vectors, student context, explicit feedback and recommendation ranking.
- `projects/nexzo/Backend/src/server.js` and its application modules: separate Node/Express runtime.
- Supplied original resume: Rudra's ownership of the modular student frontend, authentication and user-specific persistence.

Internal version identifiers remain in original project source filenames where required by that project. They are not presented as product branding or screenshots in the portfolio.

## Not verified by this pass

External assistant tool execution, AI response quality/latency, system performance benchmarks, user counts, and adoption are not verified and are not claimed. Career functionality is not proven by the Academics image; the caption explicitly identifies the captured academic screen. Public portfolio QA remains pending deployment credentials.
