# Clubhouse — group scoreboard

A static Vite + React scorecard. Each card gets a short id in the URL
(`?board=abc123def456`), and anyone opening that link sees the same scorecard.

## Storage model

- **Google Sheet** is the source of truth when `VITE_SHEETS_ENDPOINT` is set
  (see [`apps-script/README.md`](./apps-script/README.md) for the one-time setup).
- **`localStorage`** is the offline cache: the card renders instantly and keeps
  working with no signal, then syncs.
- With no endpoint configured, the app is device-only and says
  "SAVED ON THIS DEVICE".

Sync behaviour: local writes are immediate, the sheet write is debounced 800 ms,
and the card refreshes from the sheet every 10 s — but never while you are typing
in a field or have unsaved changes, so it can't clobber an edit.

## Local development

```bash
npm install
cp .env.example .env.local   # then paste your Apps Script URL
npm run dev
```

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to `main`.

1. Push this repo to GitHub (adjust the branch name in the workflow if you don't use `main`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → Variables → New variable:**
   `VITE_SHEETS_ENDPOINT` = your Apps Script `/exec` URL. It's a variable, not a
   secret, because the URL is public anyway.
4. Push, or run the workflow manually from the Actions tab.

The site lands at `https://<user>.github.io/<repo>/`. `vite.config.ts` derives that
base path from `GITHUB_REPOSITORY`, so renaming the repo needs no code change.
Everything under `/birdieTracker/assets/...` will 404 if the base is wrong, which is
the usual symptom of a Pages misconfiguration.

Because the sheet is the source of truth, the deployed static site only needs
outbound access to Google — there is no server to run.

### Custom domain

A custom domain serves a project site from the **root** of that domain, not from
`/<repo>/`, so the base path changes. Drop the hostname in `public/CNAME`:

```bash
mkdir -p public
echo "birdie-tracker.mattise.dev" > public/CNAME   # hostname only: no https://, no trailing slash
```

`vite.config.ts` detects that file and switches `base` to `/` automatically. Also set
the domain under **Settings → Pages → Custom domain** and enable **Enforce HTTPS**
once the certificate is issued. With an Actions-based deployment GitHub does *not*
create the `CNAME` file for you — it must live in the repo.

DNS at the registrar, for the subdomain `birdie-tracker`:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `birdie-tracker` | `nmattise.github.io.` | Automatic |

Check it with `dig +short birdie-tracker.mattise.dev CNAME` — it should print
`nmattise.github.io.`. An apex domain (`mattise.dev`) can't use a CNAME; it needs
GitHub's A records instead.

Verify the switch before trusting it:

```bash
grep -o 'src="[^"]*"' dist/index.html    # should start with /assets/, not /<repo>/assets/
```

### Vercel instead

Import the repo and leave the defaults; `base` resolves to `/` there either way. Add
`VITE_SHEETS_ENDPOINT` under *Settings → Environment Variables*, then redeploy.

### One thing to know

A `?board=` id is generated per origin, so the custom domain starts with an empty
local cache even though the sheet already holds your data. Open
`https://birdie-tracker.mattise.dev/?board=<id>` to pull the same card, then use
**Share** to hand out the new link.
