# FlashChat

A text-only random chat app built with Flask.

## What it does
- Randomly pairs two strangers for a text conversation
- Uses a simple server-side queue and polling
- Does not include video chat

## Run locally
1. Install Python 3.11+ or 3.12+.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the app:
   ```bash
   python app.py
   ```
4. Open `http://127.0.0.1:5000` in your browser.

## Free hosting options
You can deploy this repository to a free tier service and connect a custom domain.

### Recommended providers
- Railway (free plan)
- Render (free Web Service)
- Fly.io (free app tier)

### Render deployment
1. Sign in to https://render.com and create a new **Web Service**.
2. Connect your Git repository containing this project.
3. Set the root to the repository directory if needed.
4. Use these settings:
   - Environment: `Python`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app --bind 0.0.0.0:$PORT --log-file -`
5. Deploy.

Render will use the `render.yaml` and `Procfile` files in this repo.

### Deployment notes
- This app uses in-memory pairing. If the server restarts, active chat sessions are lost.
- For a custom domain, add your domain in the Render dashboard and update your DNS records.

## Files
- `app.py` — Flask backend
- `templates/index.html` — chat UI
- `static/style.css` — page styling
- `static/chat.js` — polling and message send logic
- `requirements.txt` — required packages
- `render.yaml` — Render service configuration
- `Procfile` — Render start command
