const requiredInProduction = ["GEMINI_API_KEY", "FIREBASE_PROJECT_ID", "ALLOWED_ORIGINS", "FIREBASE_SERVICE_ACCOUNT_JSON"];

export function validateEnvironment(){
  const production = process.env.NODE_ENV === "production";
  const required=[...requiredInProduction,...(process.env.OPENAI_API_KEY?['OPENAI_MODEL']:[]),...(process.env.GROQ_API_KEY?['GROQ_MODEL']:[])];
  const missing = required.filter(name => !String(process.env[name] || "").trim());
  if(production && missing.length){
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
  return {
    production,
    missing,
    warnings: [
      !process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_PRIVATE_KEY
        ? "Firebase Admin data access is not configured; token verification can work, but server-side Firestore features are limited."
        : ""
    ].filter(Boolean)
  };
}
