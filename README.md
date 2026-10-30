# CardWise

A personal Android app that tracks your credit cards' billing dates, spend gates, lounge visits, offers and rule changes, and tells you which card to use. Built from [SPEC.md](SPEC.md) with React Native + Expo (SDK 58).

## What's in it

| Spec phase | What the app does |
|---|---|
| 1 – Core tracker | Home (due dates, red under 5 days; best card to buy with today; gates; lounges left; one suggestion), Card detail, Lounge (visits left, reset dates, gate targets, log a visit), Settings. On-device SQLite with the seven spec tables. `src/data/rules.json` holds your seven cards. Billing-cycle maths exactly as in the spec. Spend entry form. Local notifications (5 days and 1 day before due, statement day, gate within 20% with <10 days left). JSON backup/restore through the share sheet (pick Google Drive). Fingerprint lock. |
| 2 – Automatic data | Reads bank SMS (in the installed APK) and shows parsed spends to confirm; OTP messages are dropped before parsing. Statement upload: PDF or pasted text goes to the Claude API, comes back as totals, due date and transactions for you to review. API key stored in Android secure storage. Spend-gate progress from transactions, skipping excluded categories. |
| 3 – Smart suggestions | Best card screen: ranks cards by reward value after caps, open offers, spend gates and interest-free days, with a one-line reason. Weekly summary notification. Offers screen with manual entry, expiry reminders and a used tick. |
| 4 – Monitoring | `monitor/check.mjs` runs weekly on GitHub Actions, fetches each card's official page, diffs it, and asks Claude for a plain-English summary. It publishes `monitor/updates.json`, which the app pulls into the Updates screen (with a notification) and the Offers screen. Add-on cards link to a primary card and share its gates, caps and fee waiver. |

## Get the APK on your phone

The APK is built by GitHub Actions (`.github/workflows/android-apk.yml`) on every push to `main`:

1. Push this folder to a GitHub repository.
2. Open the repository's **Actions** tab → **Build Android APK** → the latest run → download the **CardWise-apk** artifact (a zip containing `app-release.apk`).
3. Copy the APK to your phone and open it. Android will ask you to allow installs from that app (Files or Chrome) the first time.

The release APK is signed with the template's debug key. That's fine for installing on your own phone, and later builds install over earlier ones, but don't publish it to the Play Store as is.

To build on your own computer instead, you need Android Studio (for the Android SDK) and JDK 17:

```bash
npm ci
```

```bash
npx expo run:android --variant release
```

## Try it quickly in Expo Go

Everything except SMS reading works in Expo Go:

```bash
npm ci
```

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone.

## First-time setup in the app

1. **Add a card**: tap a card from the catalogue, then enter the last 4 digits, the statement day, and the due gap (due date minus statement date, read off one past statement).
2. **Settings → Claude API key** if you want statement reading.
3. **Lounge → Target this gate** on the gates you plan to hit this quarter. If you already qualified last period (before you started logging), tap **I qualified**.
4. **Settings → Back up now** once a week, saving to Google Drive.

## Updating card rules (no code change)

Edit `src/data/rules.json` and push (the next APK picks it up), or import an edited copy on the phone from **Settings → Rules file → Import rules.json**. Reward rates and caps marked "estimate" in the file are best guesses; check them against each bank's MITC.

## Turning on monitoring (Phase 4)

1. In the GitHub repository: **Settings → Secrets and variables → Actions → New repository secret**, name `ANTHROPIC_API_KEY`.
2. Run **Actions → Weekly benefits monitor → Run workflow** once. The first run only saves a baseline; changes show up on later runs.
3. In the app: **Settings → Updates feed**, paste `https://raw.githubusercontent.com/<you>/<repo>/main/monitor/updates.json`. This only works if the repository is public. For a private repository, host the file somewhere the phone can read.

Some bank pages load their content with JavaScript; the job logs a warning when a page has very little text, and those pages may need a headless browser later.

## Developer commands

```bash
npm test
```

```bash
npx tsc --noEmit
```

Code layout: `src/app/` screens (Expo Router), `src/lib/` logic (pure functions in `dates.ts`, `rewards.ts`, `gates.ts`, `sms.ts`, `bestCard.ts` are unit tested in `__tests__/`), `src/db/db.ts` SQLite, `modules/sms-reader/` the native SMS module, `monitor/` the weekly job.

## Privacy

Only card names and last 4 digits are stored, never full numbers, CVV, expiry, PIN or OTP. Data stays in the phone's SQLite database. Backups go to a file you choose. The API key is kept in Android secure storage and excluded from backups. Only statement contents go to the Claude API.
