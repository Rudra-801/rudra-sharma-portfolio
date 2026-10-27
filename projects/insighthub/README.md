# InsightHub V4 — Secure Auth Edition

Premium editorial blog project by Rudra Sharma.

## Run
```powershell
npm install
npm --prefix backend install
npm start
```
Open `http://127.0.0.1:5500`.

## Authentication
- Real backend signup and login endpoints
- bcrypt password hashing
- signed JWT sessions (7 days)
- `/api/auth/me` session validation
- persistent local backend user store for zero-setup viva demos
- admin/user roles
- protected backend post routes remain role guarded

Admin demo: `admin@insighthub.dev` / `Admin123!`

For public production deployment, rotate the JWT/admin secrets and use a managed database/user store.
