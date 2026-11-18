# CardWise

A personal Android app that tracks your credit cards' billing dates, spend gates, lounge visits, offers and rule changes, and tells you which card to use. Built from [SPEC.md](SPEC.md) with React Native + Expo (SDK 58).

## What's in it

| Spec phase | What the app does |
|---|---|
| 1 – Core tracker | Home (due dates, red under 5 days; best card to buy with today; gates; lounges left; one suggestion), Card detail, Lounge (visits left, reset dates, gate targets, log a visit), Settings. On-device SQLite with the seven spec tables. `src/data/rules.json` holds your seven cards. Billing-cycle maths exactly as in the spec. Spend entry form. Local notifications (5 days and 1 day before due, statement day, gate within 20% with <10 days left). JSON backup/restore through the share sheet (pick Google Drive). Fingerprint lock. |
| 2 – Automatic data | Reads bank SMS (in the installed APK) and shows parsed spends to confirm; OTP messages are dropped before parsing. Statement upload: PDF or pasted text goes to the Claude API, comes back as totals, due date and transactions for you to review. API key stored in Android secure storage. Spend-gate progress from transactions, skipping excluded categories. |
| 3 – Smart suggestions | Best card screen: ranks cards by reward value after caps, open offers, spend gates and interest-free days, with a one-line reason. Weekly summary notification. Offers screen with manual entry, expiry reminders and a used tick. |
| 4 – Monitoring | The app checks each card's official page weekly and asks Claude what changed, shown on Updates with a notification; offers go to Offers. Add-on cards link to a primary card and share its gates, caps and fee waiver. |

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

## Automatic data: SMS, email statements, card terms

**SMS (bank spend alerts).** More → Spends from SMS → Scan SMS inbox. Android 13+ blocks SMS access for apps installed from a file. If the app says SMS access is off, tap Open settings, then ⋮ → Allow restricted settings, then Permissions → SMS → Allow. OTP messages are always ignored. Scapia, Jupiter and Uni may send app notifications instead of SMS.

**Statements from Gmail, automatic.** Settings → Email statements: your Gmail address and a Google app password (turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords). Every few days CardWise searches Gmail (read-only) for emails from your cards' banks with "statement" in the subject, saves the PDFs, and notifies you. Review them under More → Statements from email. Bank email senders are listed per card in `rules.json` (`statement_senders`).

**Statements from Gmail, by hand.** In Gmail open the statement email, tap the PDF, then Share → CardWise.

**Password-protected PDFs.** The statement is unlocked on the phone. Type the password once per card; it's stored in secure storage and tried for that bank's other cards too. Only the extracted text goes to the Claude API.

**Card terms and conditions.** Once a week the app reads each card's official benefits page (`benefits_url` in `rules.json`). When the text changes, the changed lines go to Claude, and real changes show up under More → Updates with a notification. Offers found there go to Offers. Updates → Check now runs it immediately. The old GitHub job in `monitor/` now only runs on demand.

## Developer commands

```bash
npm test
```

```bash
npx tsc --noEmit
```

Code layout: `src/app/` screens (Expo Router), `src/lib/` logic (pure functions in `dates.ts`, `rewards.ts`, `gates.ts`, `sms.ts`, `bestCard.ts`, `html.ts` are unit tested in `__tests__/`), `src/db/db.ts` SQLite. Native modules: `modules/sms-reader/` (SMS inbox), `modules/pdf-text/` (unlock and read PDFs), `modules/statement-inbox/` (Gmail IMAP and the share sheet). The emulator job (`.github/workflows/emulator-smoke.yml`) launches every APK and runs the hidden self-test page.

## Privacy

Only card names and last 4 digits are stored, never full numbers, CVV, expiry, PIN or OTP. Data stays in the phone's SQLite database. Backups go to a file you choose. The Claude API key, Gmail app password and statement passwords are kept in Android secure storage and excluded from backups. Gmail is read only (no changes, no sending), and only emails from your banks are opened. Only statement text and changed lines of public bank pages go to the Claude API.
