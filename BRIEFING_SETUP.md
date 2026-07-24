# BharatWire — AI Briefing Setup (one-time, ~5 minutes)

Your repo becomes the server. A GitHub Action runs twice daily (6:30 AM & 6:00 PM IST),
fetches all news feeds, asks Claude to write an original editorial briefing, and commits
`briefing.json` + `news.json` to the repo. The site picks them up automatically.

## Repo structure after setup

```
your-repo/
├── index.html                      (updated version)
├── scripts/
│   └── generate.mjs
└── .github/
    └── workflows/
        └── briefing.yml
```

## Steps

1. **Upload the files.** In your repo, use "Add file → Upload files" and recreate the
   folder structure above. (When uploading, you can type `scripts/generate.mjs` as the
   filename to create the folder, same for `.github/workflows/briefing.yml`.)
   Replace `index.html` with the new version.

2. **Add your Anthropic API key as a secret:**
   - Repo → Settings → Secrets and variables → Actions → "New repository secret"
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from console.anthropic.com (starts with `sk-ant-`)
   - This is safe: secrets are encrypted and never appear on your website or in logs.

3. **Run it once manually to test:**
   - Repo → Actions tab → "Generate BharatWire briefing" → "Run workflow"
   - Wait ~1 minute. A green tick means `briefing.json` and `news.json` were committed.
   - Open your site, hard-refresh: The Briefing card appears at the top.

4. Done. It now runs itself twice a day. No servers, nothing to maintain.

## Cost

Two Claude Haiku calls per day, ~2K input + ~1K output tokens each.
That's a few paise per day — effectively free.

## Notes

- If a run fails (feed outage, API hiccup), the site simply keeps showing the last
  good briefing. Nothing breaks.
- Want a different schedule? Edit the `cron` lines in `briefing.yml`
  (times are in UTC; IST = UTC + 5:30).
- The briefing prompt lives in `generate.mjs` — tweak the voice/format there.
