window.portfolioProjects = {
  nexzo: {
    name: "NEXZO",
    shot: "assets/project-shots/nexzo-current.webp",
    url: "projects/nexzo/dist/Home.html",
    description: "Personalized Recommender System for University Students",
    sections: {
      Overview:
        "A unified student platform for academics, career guidance, planning, community, progress and intelligent assistance.",
      Problem:
        "Connect fragmented student workflows and learning context in one workspace.",
      Architecture:
        "HTML / CSS / JavaScript → Firebase Authentication and Firestore → Node.js services → recommendation and study-assistant workflows.",
      Technology:
        "JavaScript, HTML, CSS, Firebase, Node.js and model-backed AI integration. Python is used in verification tooling.",
      Features:
        "Academic resources, career paths, planning, community, recommendations and study assistance.",
      Challenges:
        "Keeping learning profile, planner activity and recommendation context coherent across modules.",
      Result:
        "Bundled student platform. Cloud and AI features require its independent environment. This portfolio does not configure or connect to NEXZO services.",
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
  [
    "Personalized Recommendations",
    "Learning context, goals and activity inform academic and career actions.",
  ],
  [
    "Complete Student Ecosystem",
    "A connected workspace for academics, career exploration, planning and community.",
  ],
  [
    "Academics & Career Guidance",
    "Subject resources, career paths and skill roadmaps.",
  ],
  [
    "Smart Planner & Evaluation",
    "Study schedules, task planning and assessment workflows.",
  ],
  [
    "Community",
    "Student discussions and collaboration within the learning workspace.",
  ],
  [
    "AI Study Assistant",
    "Model-backed explanations, quizzes and study tools; requires its independent AI service.",
  ],
  [
    "Progress Tracking",
    "Goals and learning activity provide context for the next action.",
  ],
  [
    "Modern Responsive Interface",
    "A shared product experience for desktop and mobile.",
  ],
];

for (const id of ["nexzo", "insighthub", "gamepro"]) { const p = window.portfolioProjects[id]; p.sections["My role"] = "Full-stack product engineering: interface, application behavior and integration of the bundled project systems."; p.sections["Engineering takeaways"] = id === "nexzo" ? "Shared learning context needs clear state ownership across planning, progress and recommendations." : id === "insighthub" ? "Protected publishing needs server-side authorization as well as a clear editorial interface." : "Independent game loops need consistent navigation and carefully scoped shared state."; }
