# Google Sheets backend

The app stays a plain static site. A small Google Apps Script web app sits in front
of a spreadsheet and acts as the JSON store, so no credentials ever ship to the browser.

## One-time setup

1. **Create a spreadsheet** at <https://sheets.new>. Name it something like `clubhouse`.
   (A tab called `boards` is created automatically on first write.)

2. Open **Extensions → Apps Script**. Delete the placeholder code and paste the contents
   of [`Code.gs`](./Code.gs).

3. In `Code.gs`, replace `PASTE_SPREADSHEET_ID_HERE` with the id from your sheet URL:

   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
   ```

4. **Deploy → New deployment → Web app**, with:

   | Setting | Value |
   | --- | --- |
   | Description | scoreboard |
   | Execute as | **Me** |
   | Who has access | **Anyone** |

   `Anyone` is what makes it callable from the browser without a login. The board id
   in the URL is the only thing protecting a card, so treat share links as the secret.

5. Copy the **Web app URL** (ends in `/exec`) and put it in `.env.local`:

   ```
   VITE_SHEETS_ENDPOINT=https://script.google.com/macros/s/AKfy.../exec
   ```

6. Restart `npm run dev`.

If `VITE_SHEETS_ENDPOINT` is unset, the app quietly falls back to device-only
`localStorage` storage and shows "SAVED ON THIS DEVICE".

## Verify it works

```bash
curl "$VITE_SHEETS_ENDPOINT?id=test123"          # -> null
curl -X POST "$VITE_SHEETS_ENDPOINT" \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"id":"test123","board":{"title":"t","players":[],"categories":[]}}'
curl "$VITE_SHEETS_ENDPOINT?id=test123"          # -> your board
```

## Notes and limits

- **After editing `Code.gs`** you must redeploy: **Deploy → Manage deployments →**
  edit the existing one → Version: **New version**. Otherwise the old code keeps serving.
- Writes are debounced 800 ms in the client and serialized with `LockService` on the
  server, but this is not a database: simultaneous edits to the *same* card can lose
  one side. Fine for one foursome, not for many editors.
- **Writes bypass CORS on purpose.** Apps Script answers every `POST` with a `302` to
  `script.googleusercontent.com`, and Safari refuses to follow that redirect under CORS
  (`Fetch API cannot load … due to access control checks`). The client therefore sends
  writes with `mode: 'no-cors'` and then reads the card back to confirm it landed, so a
  failed write still shows `OFFLINE` and gets retried instead of being reported as saved.
- `localStorage` remains the offline cache, so the card still works on the course with
  no signal and syncs when the connection returns.
- Apps Script quotas are generous for this use (thousands of calls per day), but each
  call costs a few hundred milliseconds.
- Anyone with a card's URL can read and write it. Rotate by generating a new card if a
  link leaks somewhere public.
