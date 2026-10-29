window.portfolioProjects = {
  nexzo: {
    name: "NEXZO",
    shot: "assets/nexzo-evidence/recommendations.png",
    url: "https://personalized-recommendersystem.web.app/",
    sourceUrl: "https://github.com/Rudra-801/rudra-sharma-portfolio/tree/main/projects/nexzo",
    description: "Personalized Recommender System for University Students",
    flow: ["Student activity", "Tasks & assessments", "Shared student state", "Recommendation ranking", "Next action", "Result & feedback", "Updated state"],
    sections: {
      Overview: "A connected student platform for academics, career planning, study workflows, community and personalized recommendations.",
      Problem: "Students have different subjects, learning goals and assessment results. A generic resource list does not use that context to decide what to study next.",
      System: "Academics, Career, Planner, Community, Study Assistant and Dashboard share student context. The captured Academics view shows a recommended next subject; Dashboard displays Planner-derived completion and study activity.",
      "Personalization loop": "The recommender source combines profile context, assessed activity, mastery, urgency, interests, career fit and planner capacity. Results and explicit feedback feed subsequent ranking. The diagram describes this implementation, not a measured outcome.",
      Architecture: "HTML/CSS/JavaScript frontend → shared data and personalization modules → authenticated persistence with Firebase Authentication and Cloud Firestore. A separate Node.js/Express service supports API and assistant workflows.",
      Technology: "HTML, CSS, JavaScript, Firebase Authentication, Cloud Firestore, Node.js and Express. Assistant tools are visible in the live interface; this capture pass does not verify every external AI tool's availability.",
      "My role": "Built the modular student platform, responsive frontend, Firebase Authentication and user-specific Firestore persistence.",
      "What I built": "Connected academic, career, planning, community, dashboard, profile and settings workflows; authentication, persistent student state and progress tracking. The source also includes personalization and Study Assistant integration.",
      "Engineering decisions": "Use shared task/profile data across modules; derive progress from completed tasks and evaluated submissions; use assessed events for mastery; retain cloud persistence across sessions. The shared data service and personalization engine implement these decisions.",
      "Engineering challenges": "The data service normalizes task status across legacy task representations and dispatches update events across modules. Its persistence code explicitly retains evaluation and reward flags so state survives synchronization.",
      Result: "A working student platform connecting study resources, planning, recommendations, community and progress. The captures show the live product on 29 October 2026.",
    },
  },
  insighthub: {
    name: "InsightHub",
    shot: "assets/project-shots/insighthub-current.png",
    url: "projects/insighthub/index.html",
    description: "Full-stack editorial and publishing platform",
    sections: {
      Overview:
        "Article discovery, search, categories and publishing workflows.",
      Problem:
        "Connect reading and publishing without compromising access control.",
      Architecture:
        "Editorial interface → Express REST API → JWT and role checks → persistent content and user store.",
      Technology:
        "HTML, CSS, JavaScript, Express, bcrypt and JWT. Includes MongoDB-ready models and a local-store demo backend.",
      Features: "Browsing, search, authentication and protected publishing.",
      Challenges: "Connecting editorial UX to protected server actions.",
      Result:
        "Bundled frontend and independent backend. Authentication and publishing need the separate InsightHub server.",
    },
  },
  gamepro: {
    name: "GamePro",
    shot: "assets/project-shots/gamepro-current.png",
    url: "projects/gamepro/index.html",
    description: "Interactive browser gaming platform",
    sections: {
      Overview:
        "Playable browser games in a shared interface. The current bundled redesign uses the NEXARC identity.",
      Problem: "Give independent games consistent navigation and progression.",
      Architecture:
        "Arcade shell → game registry → isolated modules → browser profile and progression state.",
      Technology: "HTML, CSS, JavaScript and browser persistence.",
      Features:
        "2048, Flappy Nova, Reaction Rush, Aim Lab Mini and preserved original modules.",
      Challenges:
        "Coherent navigation while games run independent interaction loops.",
      Result: "Playable local browser games with original assets preserved.",
    },
  },
  codecollab: {
    name: "CodeCollab",
    description: "Collaborative development environment · IN DEVELOPMENT",
    sections: {
      Overview: "An in-development exploration of shared coding workspaces.",
      Problem: "Help developers work together in a shared coding context.",
      Direction:
        "Collaborative editing, shared sessions and synchronized workflows.",
      Architecture:
        "Planned: editor → shared session → realtime updates. This is a concept, not verified production architecture.",
      Status: "In development. No shipped result or working demo is claimed.",
    },
  },
};
window.portfolioHighlights = [
  { title: "Personalized Recommendations", description: "Academics displays a recommended next subject and its current mastery context, with an action to continue studying.", file: "recommendations.png", label: "ACADEMIC NEXT ACTION", page: "academics.html", alt: "Real NEXZO Academics recommended next action and current subjects" },
  { title: "Complete Student Ecosystem", description: "The live Home view links Academics, Career, Planner, Community, Dashboard and Study Assistant in one workspace.", file: "home.png", label: "STUDENT WORKSPACE", page: "Home.html", alt: "Real NEXZO Home with navigation to the student modules" },
  { title: "Academics & Career Guidance", description: "This Academics capture shows current subjects, curriculum navigation and subject continuation controls. Career is a separate module in the live workspace.", file: "academics.png", label: "ACADEMICS", page: "academics.html", alt: "Real NEXZO subject cards and academic navigation" },
  { title: "Smart Planner & Evaluation", description: "The real task form provides subject, task type, level, duration and priority inputs alongside a suggestions panel. No task was submitted during capture.", file: "planner.png", label: "PLANNER", page: "planner.html", alt: "Actual NEXZO Planner task creation and suggestion controls" },
  { title: "Community", description: "The Community composer supports categorized student posts and resource attachments. Private group details are excluded from this crop.", file: "community.png", label: "COMMUNITY", page: "community.html", alt: "Actual NEXZO Community post composer and category controls" },
  { title: "AI Study Assistant", description: "The Study Assistant tool drawer exposes search, research, code, data and document controls. No conversation was created for this capture.", file: "assistant-tools.png", label: "STUDY ASSISTANT / TOOLS", page: "ai-assistant.html", alt: "Actual NEXZO Study Assistant tools drawer" },
  { title: "Progress Tracking", description: "Dashboard displays Planner-synced completion, study sessions and evaluation-derived progress in the captured application state.", file: "progress.png", label: "DASHBOARD / PROGRESS", page: "dashboard.html", alt: "Real NEXZO Dashboard displaying captured Planner-derived progress" },
  { title: "Modern Responsive Interface", description: "A real 430-pixel-wide Academics capture shows stacked navigation, subject controls and the recommended next action.", file: "mobile-academics.png", label: "MOBILE / ACADEMICS", page: "academics.html", alt: "Actual NEXZO Academics interface captured at mobile width" },
].map(item => ({ ...item, src: "assets/nexzo-evidence/" + item.file, source: "https://personalized-recommendersystem.web.app/" + item.page }));
