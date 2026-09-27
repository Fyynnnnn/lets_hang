# Let's Hang

A small event invitation app for friends, built with Node.js and Express.

## Run locally

```powershell
npm install
npm start
```

Open <http://localhost:3000>.

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

## Prototype data warning

This version stores accounts, events, and notifications as JSON files. The files are intentionally excluded from GitHub. Render's free web service has an ephemeral filesystem, so data can reset after a restart or redeploy. Use this deployment to preview the app, not as the permanent home for friends' accounts or event history. Before relying on persistent user data, move storage to a managed database or explicitly configure persistent storage and backups.

The app uses in-memory sessions, so users may need to sign in again after a server restart or deploy.
