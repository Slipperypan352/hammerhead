# Care Tracker

A small static web app for tracking how your club is caring for individuals: meeting times, who meets with them, follow-up dates, and notes. All data lives in `data.csv` in this repo.

## Files

- `index.html` - the page
- `app.js` - all the logic (no build step, no dependencies)
- `data.csv` - the data; you can also open and edit it in Excel or Google Sheets

## Publish on GitHub Pages

1. Create a new repository on GitHub and upload these three files to the root.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
4. After a minute or two your app is live at `https://<your-username>.github.io/<repo-name>/`.

## Saving changes

Edits are held in your browser until you press **Save**. Two options:

- **Save directly to GitHub (recommended).** Click the gear icon, confirm owner/repo/branch, and paste a fine-grained personal access token limited to this one repository with **Contents: Read and write**. Save then commits `data.csv` for you. The token is stored only in that browser.
  - Create one at GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens.
- **Manual.** With no token, Save (or the CSV button) downloads `data.csv`. Upload it to the repo to replace the old one.

Unsaved changes are also kept in your browser, so a closed tab will not lose them. If several people edit, press Save promptly and reload before editing so you do not overwrite each other's changes (the last save wins).

## Privacy - please read

**GitHub Pages sites are public, and so is `data.csv`.** Anyone with the link, or who finds the repo, can read the names, contact info and notes. Private repositories can only publish Pages on paid GitHub plans, and even then the site may be public unless you are on an Enterprise plan with access control. Because this data is about real people's personal lives:

- Prefer first names or initials, and keep sensitive details (health, family, struggles) out of notes.
- Do not put phone numbers or emails in a public repo.
- Get consent from the people being tracked, and check with your club's leadership or campus ministry guidelines.
- If you need real privacy, host this behind a login (for example a private deployment) instead of public Pages.

## Columns in data.csv

`id, name, contact, status, meeting_day, meeting_time, frequency, location, met_by, last_contact, next_followup, notes, updated`

Dates use `YYYY-MM-DD`; times use 24-hour `HH:MM`. Keep the header row as is.
