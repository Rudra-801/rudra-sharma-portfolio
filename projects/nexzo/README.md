# NEXZO

NEXZO is a personalized learning and student productivity platform designed for university students. It combines academic resources, study planning, career guidance, community features, progress tracking, gamification, and an integrated study assistant in one responsive web application.

## Core modules

- **Home** — personalized overview and quick access to platform features
- **Academics** — subject resources, structured learning content, practice and progress tracking
- **Career** — CSE career paths, skill guidance, roadmaps and interview preparation
- **Planner** — task planning, study schedules, submissions and progress monitoring
- **Community** — student posts, discussions and collaboration features
- **Dashboard** — personalized recommendations, activity, goals and learning progress
- **Study Assistant** — explanations, problem solving, quizzes, planning and study tools
- **Profile & Settings** — account preferences, progress metrics and platform personalization
- **NEXZO Hub** — XP, levels, streaks and engagement features

## Personalization

NEXZO maintains a student learning profile using academic context, goals, interests, learning preferences, planner activity, assessment signals and progress. The recommendation layer uses this shared context to prioritize relevant academic, career and study actions across the platform.

## Technology

- HTML, CSS and JavaScript frontend
- Firebase Authentication, Firestore, Storage and Hosting
- Node.js backend service
- Model-backed study-assistant and evaluation features
- Responsive, local-first state handling with cloud synchronization

## Local development

Serve the `Frontend/` directory through a local web server. Firebase-backed features require the configured Firebase project. Model-backed features require the backend service and its environment configuration.

## Verification

Run the project verification suite from the repository root:

```bash
npm test
```

For a production release:

```bash
npm run verify:release
```

## Production build

The production frontend is generated in `dist/`:

```bash
npm run build
```

Deployment details are documented in `DEPLOYMENT.md`.
