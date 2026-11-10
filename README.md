# SNSU Connects

Campus event and attendance tracker with Reminder AI. Backend: Node.js + Express + SQLite. Frontend: vanilla HTML, CSS and JS.

## Folders
- `backend/`  API, database, scheduler and seed script (run everything from this folder)
- `frontend/` the web app (served by the backend, nothing to build)

## Run it
1. Install Node.js 18 or newer: https://nodejs.org
2. `cd backend` then `npm install`
3. Copy `.env.example` to `.env` and set `JWT_SECRET` to a long random string
4. `npm run seed`
5. `npm start`, then open http://localhost:3000

Seed accounts (change them in `backend/src/scripts/seed.js` first):
- admin@snsu.edu.ph / Admin@12345
- juan.delacruz@snsu.edu.ph / Student@12345

## Reminder AI
- Students create, edit, complete and delete reminders (title, date, time, optional alerts before).
- A scheduler inside the server checks every 30 seconds (`SCHEDULER_SECONDS`) and creates notifications for
  custom reminders, upcoming events and registration deadlines. Each alert is saved so it is sent only once.
- Notifications show in the bell inside the app. They are created by the server, so the server must be running.
- Real phone/browser push (works when the app is closed): run `npm run vapid`, paste the keys into `.env`, restart,
  then each student taps "Turn on push on this device" on the Reminders page. Needs HTTPS (or localhost).
  The app only shows "push sent" when the push service accepted the message.
- Reminder AI chat: without `ANTHROPIC_API_KEY` it runs in basic mode (understands common phrases).
  With the key it uses Claude and can call the same reminder tools for the signed-in student only.
- Events have an optional registration deadline. It is informational: the app has no registration flow yet.

## Notes
- For real use set `SKIP_GEOFENCE=false` in `.env` and give each event a latitude, longitude and radius.
- Camera, GPS and push need HTTPS or localhost.
- Before real students use it: get school approval, use HTTPS, and add login rate limiting.
