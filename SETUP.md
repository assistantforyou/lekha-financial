# Portfolio Terminal — setup for a new contributor

This guide assumes **no coding experience**. Follow it top to bottom; every command is meant to be copied and pasted as-is.

You do **not** need to buy an Anthropic API key. Your Claude subscription covers Claude Code, which is the tool you will use to work on this project.

---

## 1. What you are setting up

- **The app** — a Node.js web app (static pages in `public/`, serverless functions in `api/`). It runs locally on your computer at `http://localhost:3456`.
- **Claude Code** — an AI coding assistant that runs in your terminal and can read, edit and run this project for you.
- **A secrets file** — the app talks to Supabase, stock-data providers and AI models. Those keys are **not** in the repository (on purpose). James sends them to you separately.

---

## 2. Install the basics

You need **Node.js 20 or newer** and **git**.

### macOS

```bash
# Homebrew (skip if you already have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node git
```

### Windows

Install from the official sites, then reopen your terminal:

- Node.js: https://nodejs.org (choose the LTS installer)
- Git: https://git-scm.com/download/win

### Check it worked

```bash
node -v      # should print v20.x or higher
npm -v
git --version
```

If any of those print "command not found", close and reopen your terminal and try again.

---

## 3. Set up Claude Code with your subscription

Install Claude Code:

```bash
npm install -g @anthropic-ai/claude-code
```

Then start it:

```bash
claude
```

When it asks how to authenticate, choose **"Log in with Claude account"** and sign in with the same account as your Claude subscription (Pro or Max). You do **not** need an API key.

> If it complains about an `ANTHROPIC_API_KEY` already being set, run `unset ANTHROPIC_API_KEY` (macOS/Linux) or `set ANTHROPIC_API_KEY=` (Windows) and start `claude` again.

You can check it is working with:

```bash
claude --version
```

**Do not** create or share Anthropic API keys for this. The subscription is the intended path.

---

## 4. Get the code

The repository is private. James will invite your GitHub account as a collaborator. Accept the invite in your email (or at https://github.com/notifications), then:

```bash
cd ~/Desktop          # or wherever you keep projects
git clone https://github.com/assistantforyou/portfolio-terminal.git
cd portfolio-terminal
```

If git asks you to sign in, use your own GitHub account and a **personal access token** as the password (GitHub no longer accepts account passwords over HTTPS):
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → tick `repo`.

---

## 5. Install the project's packages

```bash
npm install
```

This only needs to be run again when `package.json` changes.

---

## 6. Add the secrets file

The app reads secrets from a file **outside** the project, so they can never be committed by accident:

`~/.config/portfolio-terminal/keys.env`

Create the folder and the file:

```bash
mkdir -p ~/.config/portfolio-terminal
```

Open `keys.env` in any text editor (TextEdit, Notepad, VS Code) and paste the template from **`keys.env.example`** in this repository, then replace each placeholder with the real value James sends you.

- Never commit this file.
- Never paste these keys into chat, a screenshot, or a public issue.
- If a key leaks, tell James so it can be rotated.

On Windows the path is `%USERPROFILE%\.config\portfolio-terminal\keys.env`.

---

## 7. Run the app

Easiest — use the included script; it loads the secrets file for you:

```bash
./dev.sh          # http://localhost:3456
./dev.sh 4000     # use a different port
```

On Windows, run that from **Git Bash** (installed with Git for Windows).

Or do it by hand:

Load the secrets and start the dev server:

### macOS / Linux

```bash
set -a; source ~/.config/portfolio-terminal/keys.env; set +a
export AV_API_KEY="${AV_API_KEY:-$ALPHAVANTAGE_API_KEY}"   # accept either name
node scripts/dev-server.mjs 3456
```

(The `export` line matters: some keys files use `ALPHAVANTAGE_API_KEY`, while the code reads `AV_API_KEY`.)

### Windows (PowerShell)

The `.env` file is easiest to load via Git Bash, which comes with Git for Windows. In Git Bash:

```bash
set -a; source ~/.config/portfolio-terminal/keys.env; set +a
export AV_API_KEY="${AV_API_KEY:-$ALPHAVANTAGE_API_KEY}"
node scripts/dev-server.mjs 3456
```

Open **http://localhost:3456** in your browser. Leave the terminal running; press `Ctrl+C` to stop it.

---

## 8. What works without keys

You can still explore and change the UI with no secrets at all:

- All pages in `public/` (layout, panels, charts shell)
- `api/free/*` endpoints that fetch public data

These need keys and will show errors or empty panels until the file is filled in:

- Accounts / sign in (Supabase)
- Statement import and AI news (Z.ai / Gemini)
- Brokerage holdings (Alpaca)
- Analyst data, price history, all-time highs (Alpha Vantage, Twelve Data)
- Billing (Stripe)

The site's plans (Demo / Free / Paid ฿299 / Premium ฿599) and exactly what each tier
gets are documented in **`docs/TIERS.md`**. The two Stripe price ids
(`STRIPE_PRICE_PAID`, `STRIPE_PRICE_PREMIUM`) only need to be filled in for paid-plan
checkout; without them checkout returns a friendly "not set up" message and everything
else works.

---

## 9. Everyday workflow

Ask Claude Code to do the work for you. A good first session:

```bash
cd ~/Desktop/portfolio-terminal
claude
```

Then, inside Claude Code, something like:

> Read SETUP.md and the docs folder, then explain how this project is laid out.

Before changing anything:

```bash
git pull
git checkout -b your-name/short-description
```

Run the tests when you (or Claude) change server code:

```bash
node api/_import.test.js
node api/_llm.test.js
```

(any file in `api/` ending in `.test.js` is a test file — run it the same way)

When you are happy with a change:

```bash
git add -A
git commit -m "Short description of what changed"
git push -u origin your-name/short-description
```

Then open a pull request on GitHub. **Do not push directly to `main`** unless James tells you to.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `command not found: node` | Node isn't installed or the terminal wasn't restarted. Reinstall from §2. |
| `EADDRINUSE` / port already in use | Something else is on 3456. Run `node scripts/dev-server.mjs 3457` and open that port. |
| Panels are empty / 500 errors | The secrets file isn't loaded. Re-run the `source` command in §7 in the same terminal. |
| Sign-in fails | Supabase keys are missing or wrong. Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. |
| AI import fails | Check `ZAI_API_KEY` first, then `GEMINI_API_KEY`. |
| `git push` rejected | You're on `main`. Create a branch (§9). |
| Claude Code asks for an API key | Choose the account login option; unset `ANTHROPIC_API_KEY` and retry (§3). |

---

## 11. Rules of the road

- Never commit a file containing a key. `.env*` is ignored, and `keys.env` lives outside the repo, so this should be automatic — don't fight it.
- Never share your Claude login. If James needs to see something, share the screen, not the credentials.
- Ask before adding a new paid service. The project deliberately uses free tiers (Z.ai, Alpha Vantage free, SEC EDGAR, ECB).
- When in doubt, ask Claude Code: *"what does this file do?"* before letting it change anything.
