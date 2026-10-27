# Rudra Sharma — Engineering Portfolio

A bespoke dark portfolio built with the existing HTML, CSS and JavaScript stack. Includes the supplied portrait, CSS 3D product surface, eight NEXZO feature selectors, accessible case-study dialogs, selected projects, engineering capabilities, education/journey and an isolated contact API.

## Local run

Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

Open http://127.0.0.1:5500. `npm run dev` enables server restart on changes. No Firebase credentials are needed locally.

```sh
npm run check
npm test
```

## Contact storage

Copy `backend/.env.example` to `backend/.env` only when changing configuration.

- `CONTACT_STORE=local` (default): writes to ignored `backend/data/portfolio-contacts.json`. The UI explicitly identifies local preview submissions. No email is sent.
- `CONTACT_STORE=firebase`: requires a **new, separate portfolio** project ID in `PORTFOLIO_FIREBASE_PROJECT_ID`, plus an absolute path to that project's service-account JSON in `PORTFOLIO_FIREBASE_CREDENTIALS`. The credential project must match. Server-only Admin SDK writes to `portfolioContacts`.
- `CONTACT_STORE=mongodb`: preserves the existing MongoDB contact option, configured with `MONGODB_URI`.

Production refuses local contact storage. Cloud credentials must be stored outside the repository. No Firebase deployment has been performed. The NEXZO project is explicitly rejected by the portfolio contact configuration.

## Source map

- `index.html`, `style.css`: semantic layout, responsive design, reduced-motion styles and portrait composition.
- `script.js`: navigation, scroll choreography, highlight selection, dialogs and contact states.
- `projects-data.js`: centralized, source-grounded case-study and feature content.
- `assets/rudra-portrait.png`: transparent cutout from Rudra's supplied photo. Original face, clothing and pose were requested preserved; background extraction used the built-in image tool.
- `assets/portrait-config.json`: portrait asset path and accessible description.
- `backend/server.js`: current Express entry point; validated contact API, safe public file serving and preserved demo API routes.
- `backend/contact-store.js`: isolated local/Firebase/MongoDB adapters.
- `backend/mongodb-server.js`: preserved original MongoDB server.
- `backend/native-server.js`, `backend/express-server.js`: retained legacy/demo implementations; do not deploy them as public entry points.
- `projects/`: original bundled project implementations preserved. These have independent service requirements.
- `tests/backend.test.js`: HTTP validation, persistence, failure behavior, private file blocking, configuration isolation and local-link checks.

## Deployment preparation (not deployed)

Use a Node-capable host, `npm ci`, then `npm start`. Set `NODE_ENV=production`, configure the independent Firebase or MongoDB contact store and set `HOST=0.0.0.0`. Set `TRUST_PROXY` only to the actual trusted proxy hop count. Keep all secrets and contact records out of Git. Configure the final domain/canonical URL and absolute social-image URL after choosing hosting.

The included Render manifest is a configuration template only; no hosting or Firebase project was created. GitHub Pages cannot run the contact API.

## Project boundaries

Opening a bundled project is separate from visiting the portfolio. NEXZO cloud/AI features require its own existing service configuration; the portfolio has no Firebase browser initialization and does not reuse those settings. NEXZO files and Firebase configuration are left unchanged. InsightHub authentication/publishing requires its own backend. CodeCollab is clearly in development. No employment, dates or success metrics were invented.

## Interaction and performance

CSS perspective provides spatial depth without a WebGL bundle or permanent render loop. Scroll work is requestAnimationFrame-throttled and only updates visible stages. Small screens flatten the product surface. Reduced-motion removes entrance transforms and smooth scrolling. Native selection, keyboard shortcuts, context menus and browser scrolling remain intact. Scrollbars are hidden with standard and vendor rules. Native dialog behavior provides focus trapping and Escape dismissal.

## Portrait edit provenance

Built-in image generation/edit tool, background extraction prompt: Remove only the outdoor background to alpha transparency; preserve the supplied person's face, hair, expression, skin, beard, pose, proportions, clothing, shoes and watch; no new person or text; clean natural hair edges. Output copied to `assets/rudra-portrait.png` (about 750 KB).
