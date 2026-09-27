# Let's Hang

A small event invitation app for friends, built with Node.js and Express.

## Run locally

```powershell
npm install
npm start
```

Open <http://localhost:3000>.

## Storage: where the data actually lives

The app has two storage backends, chosen automatically:

| Environment variable | Backend | Used for |
| --- | --- | --- |
| `DATABASE_URL` **not set** | local JSON files in `data/` | local development only |
| `DATABASE_URL` **set** | Postgres (Neon / Supabase / Render Postgres) | anything public |

**Never rely on the JSON files in a deployment.** Render's free plan has an
ephemeral filesystem: local file changes are lost whenever the service
**redeploys, restarts, or spins down** — and a free service spins down after
just 15 minutes without traffic, wiping every account and event stored in
`data/*.json`. This is why `data/*.json` is in `.gitignore`.

### Configure the database on Render

1. Create a free Postgres database (e.g. Neon) and copy its connection string.
2. In Render, open this service → **Environment**, add a variable:
   - Key: `DATABASE_URL`
   - Value: the connection string (e.g. `postgres://…@….neon.tech/neondb?sslmode=require`)
3. Save. Render redeploys automatically; the logs should show
   `Storage backend: Postgres (…)`.

Setting only `DATABASE_URL` is enough — no code changes.

### Sessions

The app keeps login sessions in memory, so users need to sign in again after a
restart or redeploy. Accounts, events, and notifications survive because they
live in Postgres.

## Live

<https://lets-hang-r9jg.onrender.com>

## Publish with GitHub and Render

1. Create a new GitHub repository. Do not upload `.env`, `data/*.json`, or `node_modules/`; they are excluded by `.gitignore`.
2. In the project folder, initialize and push the code:

```powershell
git init
git add .
git status
git commit -m "Prepare Let's Hang deployment"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/YOUR-REPOSITORY.git
git push -u origin main
```

3. In Render, choose **New +** > **Blueprint** and connect the GitHub repository containing this project.
4. Render reads `render.yaml`, builds with `npm install`, starts with `npm start`, and checks `/health`.
5. When the deploy finishes, open the `onrender.com` URL shown by Render and test registration and event creation.
6. Future changes can be published by committing and pushing them to `main`; Render auto-deploys updates.
