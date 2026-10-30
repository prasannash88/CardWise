# Card Benefits Tracker — Build Spec

Oct 30, 2026 · Prasanna

## Overview

An Android app, for your personal use, that tracks every card's dates,
spend gates, lounge visits, offers and rule changes, and tells you which
card to use. You build it with an AI coding agent; you never write code
yourself.

The single most valuable feature for your cards is **spend-gate
tracking**. Almost every lounge benefit you hold now unlocks only if you
spent enough in the previous month or quarter.

**Key decisions**

| Decision     | Choice                                   | Why                                                    |
|--------------|------------------------------------------|--------------------------------------------------------|
| Platform     | Android only                             | Lets the app read bank SMS for automatic spend logging |
| Distribution | Install the APK directly (no Play Store) | Avoids Play Store SMS-permission restrictions          |
| Framework    | React Native + Expo                      | AI agents write it well; instant testing on your phone |
| Builder      | Claude Code (or similar AI coding agent) | You describe features in plain English                 |
| Data storage | On the phone (SQLite)                    | Private, free, no server to run                        |
| AI features  | Claude API                               | Statement reading, T&C summaries, card advice          |
| Server       | One small scheduled job, Phase 4 only    | Watches bank pages for offer and T&C changes           |

## Your cards: starter catalogue

This seeds the app's rules database. Figures come from issuer pages and
card review sites as of Oct 2026; verify each against the bank's latest
MITC before relying on it. Variants confirmed: Tata Neu Plus, Adani One
Platinum, CRED IndusInd.

| Card                     | Network                   | Annual fee                                | Lounge access                                                     | Spend gate to unlock                                                                      | Rewards highlight                                                                                                   | Watch-outs                                                                                           |
|--------------------------|---------------------------|-------------------------------------------|-------------------------------------------------------------------|-------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Scapia (Federal Bank)    | Visa + RuPay              | Lifetime free                             | Unlimited domestic (one airport privilege per cycle)              | Rs 20,000 in previous billing cycle (raised from Rs 10,000 on 27 Feb 2026)                | Scapia Coins; highest on Scapia app travel; zero forex                                                              | No coins on fuel, rent, insurance, utilities; coins redeem only on Scapia travel                     |
| MakeMyTrip ICICI         | Mastercard + RuPay (dual) | Rs 999 + GST                              | 8 domestic/yr (2 per quarter) + 1 international/yr                | Rs 75,000 in previous calendar quarter (from 1 Jul 2026)                                  | myCash, never expires (1 myCash = Re 1); Rs 1,000 MMT voucher yearly; MMTBLACK Gold                                 | BookMyShow 25% off 2nd ticket (max Rs 150) once a month per network; lounge for primary only         |
| Adani One ICICI Platinum | Visa                      | Rs 750 + GST (waived at Rs 3L/yr)         | 2 domestic per quarter; premium lounge upgrades at Adani airports | Rs 75,000 in previous calendar quarter (from 1 Jul 2026)                                  | 3% on Adani One app and Adani airports; ~1% elsewhere; welcome flight voucher                                       | Shares ICICI's Rs 75,000 gate with MMT, so two separate targets each quarter                         |
| Tata Neu Plus HDFC       | RuPay                     | Rs 499 + GST (waived at Rs 1L/yr)         | 1 domestic voucher per quarter (4/yr)                             | Rs 50,000 in calendar quarter (since 10 Jun 2025); voucher claimed on HDFC rewards portal | 2% NeuCoins on Tata brands (more via NeuPass); 1% others; UPI rewards capped 500 NeuCoins/month                     | NeuCoins expire after 12 months; 5% on Tata Neu app only when paid with this card (since 1 May 2026) |
| CRED IndusInd            | RuPay + JCB               | Rs 499 (check your fee; some issued free) | None                                                              | Not applicable                                                                            | Up to 5 CRED Points per Rs 100 on online and CRED spends, incl. UPI; 1% fuel surcharge waiver                       | Points best redeemed inside CRED; JCB side useful for some international acceptance                  |
| Edge+ CSB (Jupiter)      | RuPay                     | Lifetime free (current offer)             | None                                                              | Not applicable                                                                            | Jewels: high rate on select shopping brands (Amazon, Flipkart, Myntra etc., capped), mid rate on travel, ~1% others | Rewards managed in Jupiter app; monthly caps                                                         |
| Uni GoldX (BOBCARD)      | RuPay                     | Lifetime free                             | None                                                              | Not applicable                                                                            | 1% back as 24K digital gold; up to 5% via Uni Store vouchers; zero forex                                            | Gold redeemed via Uni app                                                                            |

**What this means for the app:** lounge access on four cards depends on
spend gates totalling about Rs 2.2 lakh per quarter (two ICICI cards at
Rs 75,000 each, Tata Neu at Rs 50,000) plus Rs 20,000 a month on Scapia.
You probably can't hit all of them, so the app should help you choose
which gates to target each quarter.

Sources: [Scapia rule change, Feb
2026](https://cardadvisor.in/changes/2026-W09) · [MakeMyTrip ICICI
launch](https://icicibank.com/about-us/article/icici-bank-and-makemytrip-launch-a-co-branded-credit-card-for-travel-enthusiasts)
· [MMT ICICI lounge
gate](https://savesage.club/credit-card/icici-makemytrip-rupay/lounge-access)
· [Tata Neu Infinity
HDFC](https://hdfcbank.com/personal/pay/cards/credit-cards/tata-neu-infinity-hdfc-bank-credit-card)
· [Tata Neu Plus vs
Infinity](https://www.paisabazaar.com/credit-card/tata-neu-plus-vs-infinity-credit-cards)
· [Adani One ICICI
cards](https://icicibank.com/personal-banking/cards/credit-card/adani-icici-credit-card)
· [Adani One Signature
fees](https://bankbazaar.com/credit-card/icici-adani-one-signature-credit-card.html)
· [IndusInd lounge spend
rule](https://livefromalounge.com/indusind-bank-puts-a-price-on-lounge-access-effective-april-1-2026/)
· [Edge+
CSB](https://www.siliconindia.com/news/startups/jupiter-partners-with-csb-bank-to-launch-highreward-rupay-credit-card-nid-236524-cid-19.html)
· [Uni GoldX BOBCARD](https://bobcard.co.in/credit-card-types/uni-goldx)

More sources: [ICICI Rs 75,000 gate on Adani One and MMT, Jul
2026](https://cardinsider.com/blog/icici-bank-updates-lounge-access-rules-adani-one-mmt-credit-cards/)
· [Adani One Platinum
review](https://cardadvisor.in/articles/adani-one-icici-bank-platinum-credit-card-review-2026)
· [Tata Neu spend-based
lounge](https://livefromalounge.com/hdfc-bank-tata-neu-cards-spend-based-lounge-access/)
· [Tata Neu Plus 2026
changes](https://cardexpress.in/cards/hdfc-tata-neu-plus) · [CRED
IndusInd
RuPay](https://www.bankbazaar.com/credit-card/cred-IndusInd-bank-rupay-credit-card.html)

## Data model

Seven tables hold everything; give this list to the AI agent as-is. Card
rules live in a separate JSON file so you can update benefits without
touching code.

| Table         | Key fields                                                                                                                                                                                                                                 | Notes                                                             |
|---------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------|
| cards         | id, name, bank, network, last4, statement_day, due_gap_days, credit_limit, annual_fee, fee_due_month, is_addon, primary_card_id                                                                                                            | Only last 4 digits, never the full number                         |
| card_rules    | card_id, reward_rates (by category), caps, excluded_categories, lounge_domestic, lounge_international, lounge_period (month / quarter / year), spend_gate_amount, spend_gate_window, fee_waiver_spend, milestones, source_url, verified_on | Loaded from rules.json; one entry per card variant                |
| transactions  | id, card_id, date, amount, merchant, category, source (sms / statement / manual), counts_for_gate                                                                                                                                          | Excluded categories (fuel, rent, utilities) flagged automatically |
| statements    | card_id, period_start, period_end, total_due, min_due, due_date, paid_on                                                                                                                                                                   | From PDF upload or manual entry                                   |
| lounge_visits | card_id, date, airport, type (domestic / international), guest                                                                                                                                                                             | Counted against quota for the current period                      |
| offers        | card_id, title, merchant, valid_from, valid_to, how_to_use, used                                                                                                                                                                           | Manual first; auto-fetched in Phase 4                             |
| tnc_snapshots | card_id, url, fetched_on, text_hash, ai_summary_of_change                                                                                                                                                                                  | Compared each week to detect changes                              |

## Screens

Eight screens cover all phases; build them in the phase listed.

| Screen       | What it shows                                                                                                | Phase |
|--------------|--------------------------------------------------------------------------------------------------------------|-------|
| Home         | Upcoming due dates (red under 5 days), spend gates in progress, lounges left this period, one top suggestion | 1     |
| Card detail  | Dates, fee and waiver progress, reward rates, lounge quota, milestones, add-on cards, source link            | 1     |
| Lounge       | Visits left per card, reset dates, which card unlocks lounge next period, log a visit                        | 1     |
| Transactions | Spends by card and category, auto-logged from SMS, editable                                                  | 2     |
| Best card    | Enter amount + merchant or category; ranked cards with expected value and why                                | 3     |
| Offers       | Active offers per card, expiring soon, mark as used                                                          | 3     |
| Updates      | T&C and benefit changes with plain-English summaries and what it means for you                               | 4     |
| Settings     | Notification times, backup / restore, rules file version                                                     | 1     |

## Billing cycle and rewards logic

The Home screen shows, for every card: statement date, due date, days
left to the next bill, how many interest-free days a purchase today
gets, and rewards earned this cycle. All five come from two numbers you
enter once per card: statement day and due gap.

**What you enter per card**

- Statement day (1–31), e.g. 5

- Due gap in days after statement, e.g. 18 (read it off one past
  statement)

**How the app calculates**

| Item                                | Rule                                                                        | Example (statement day 5, due gap 18, today 30 Oct)       |
|-------------------------------------|-----------------------------------------------------------------------------|-----------------------------------------------------------|
| Next statement date                 | Next occurrence of statement day; if the month is shorter, use its last day | 5 Nov                                                     |
| Days left to bill                   | Next statement date minus today                                             | 6 days                                                    |
| Due date of that bill               | Next statement date plus due gap                                            | 23 Nov                                                    |
| Interest-free days if you buy today | Due date of the bill that will include today's purchase minus today         | 24 days                                                   |
| Best day to buy                     | Day after the statement date: the purchase lands on the following bill      | 6 Nov gives 47 days (lands on the 5 Dec bill, due 23 Dec) |
| Worst day to buy                    | Statement date itself                                                       | 5 Nov gives 18 days                                       |

**Best card to buy with today**

One list, sorted by interest-free days, with rewards for the purchase
alongside. Tag each card: "Just billed, buy now" (1–5 days after
statement), "Bill soon" (5 days or fewer to statement), or "Due in X
days" in red when a payment is near.

**Rewards from your transactions**

You enter amount, merchant or category, and card (or SMS fills it in
Phase 2). The app then:

1.  Looks up the card's rate for that category in rules.json.

2.  Applies the bank's earning unit, e.g. points per Rs 100 or Rs 200,
    rounding down as the bank does.

3.  Skips excluded categories (fuel, rent, utilities, insurance, EMIs,
    wallet loads, as per each card).

4.  Applies monthly or cycle caps and shows how much cap is left.

5.  Converts to rupee value (e.g. 1 myCash = Re 1, 1 NeuCoin = Re 1, 5
    Scapia Coins = Re 1).

6.  Adds the spend to every spend gate and fee-waiver target it counts
    toward.

Per card and per cycle it shows: total spent, rewards earned in points
and rupees, cap remaining, and progress to each gate.

**Edge cases the agent must handle:** statement day 29–31 in short
months; due dates falling on weekends or holidays (show the date as
printed, warn a day earlier); refunds that reduce rewards; and
correcting the cycle dates when a real statement arrives.

## Roadmap and prompts

Five phases over about 12 weeks at a few hours a week. Finish and use
each phase before starting the next. Paste each prompt to the AI agent
one at a time; test on your phone after each.

### Phase 0 — Setup (week 1)

Goal: a "hello world" app running on your phone.

- [ ] Install the AI coding agent, Node.js and Git on your computer

- [ ] Create free GitHub and Expo accounts; install Expo Go on your
  Android phone

- [ ] Save this spec as SPEC.md in the project folder

> Prompt: "I am not a programmer. Create a new React Native app with
> Expo and TypeScript called CardWise. Read SPEC.md. Set up the project,
> explain each step in plain words, and tell me exactly how to open it
> on my Android phone with Expo Go."

### Phase 1 — Core tracker (weeks 2–3)

Goal: you stop missing due dates and know your lounge balance.

> Prompt 1: "Add on-device SQLite storage with the tables in SPEC.md.
> Create rules.json with my seven cards from the catalogue section."
>
> Prompt 2: "Build the Home, Card detail and Lounge screens from
> SPEC.md. Let me add a card, set billing and due day, and log lounge
> visits."
>
> Prompt 2b: "Implement the 'Billing cycle and rewards logic' section of
> SPEC.md exactly. Add a transaction entry form (amount, category,
> merchant, card). Write unit tests for the date maths, including
> statement days 29–31 and February."
>
> Prompt 3: "Add local notifications: 5 days and 1 day before each due
> date, statement day, and when a spend gate is under 20% from the
> target with less than 10 days left."
>
> Prompt 4: "Add backup and restore of all data to a JSON file I can
> save to Google Drive."

### Phase 2 — Automatic data (weeks 4–6)

Goal: spends log themselves.

> Prompt 5: "Switch to an Expo development build so we can use native
> modules. Add SMS reading for bank alert messages. Parse amount, card
> last 4, merchant and date. Show parsed spends for me to confirm before
> saving. Build an APK I can install."
>
> Prompt 6: "Add statement PDF upload. Send the text to the Claude API
> and extract total due, minimum due, due date and transactions as JSON.
> Let me review before saving. Store my API key securely on the device."
>
> Prompt 7: "Calculate spend-gate progress per card from transactions,
> excluding the categories in rules.json."

### Phase 3 — Smart suggestions (weeks 7–8)

Goal: always pay with the right card.

> Prompt 8: "Build the Best card screen. For an amount and merchant,
> rank my cards by reward value, remaining caps, open offers and how
> much each spend-gate needs. Explain each pick in one line."
>
> Prompt 9: "Add a weekly summary notification: gates at risk, lounges
> expiring, fee-waiver progress, and one suggestion."
>
> Prompt 10: "Add the Offers screen with manual entry, expiry reminders
> and a used tick."

### Phase 4 — Monitoring (weeks 9–12)

Goal: you hear about rule changes before they cost you.

> Prompt 11: "Create a small scheduled job (Supabase Edge Function or
> GitHub Actions) that fetches each card's official benefits and MITC
> page weekly, compares it with last week's text, and when it changes
> asks the Claude API for a plain-English summary of what changed for
> me."
>
> Prompt 12: "Send those changes to the app as push notifications and
> list them on the Updates screen. Add offers found on the same pages to
> the Offers screen."
>
> Prompt 13: "Add add-on card tracking: link each add-on to its primary
> card and show which benefits it shares or doesn't get."

## Data sources and automation

SMS gives real-time spends, statements give the authoritative totals,
and official bank pages give the rules. Nothing needs bank logins.

| Source                          | Gives you                                       | How                                      | Limits                                                                                                                          |
|---------------------------------|-------------------------------------------------|------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| Bank SMS alerts                 | Each spend: amount, card last 4, merchant, date | Android SMS permission in your own APK   | Formats differ per bank; keep a parser per bank; fintech cards (Scapia, Jupiter, Uni) may send app notifications instead of SMS |
| Statement PDFs                  | Due amount, due date, full transaction list     | Upload in app; Claude API extracts JSON  | PDFs are often password-protected; app asks for the password once and stores it on-device                                       |
| Official benefit and MITC pages | Rules, offers, changes                          | Weekly fetch + text compare + AI summary | Some pages load via JavaScript and may need a headless browser                                                                  |
| Your manual input               | Lounge visits, corrections, offers              | Quick-add buttons                        | Your effort, kept to taps                                                                                                       |

Expected running cost: Claude API usage for one person is typically a
few hundred rupees a month or less; Supabase and GitHub Actions have
free tiers that cover this.

## Working with AI agents

Small steps, frequent testing and a written spec matter more than any
tool choice.

1.  One feature per request. Test it on your phone before asking for the
    next.

2.  After each working feature, ask the agent to "commit to Git with a
    clear message". That is your save point.

3.  When something breaks, paste the exact error text or a screenshot
    back to the agent.

4.  If the agent goes in circles for 3 tries, ask it to "undo to the
    last commit and try a simpler approach".

5.  Keep SPEC.md updated. Tell the agent to read it at the start of
    every session.

6.  Ask the agent to explain what it changed in plain words. You will
    learn steadily.

7.  Update rules.json yourself when a bank changes benefits; no code
    change needed.

## Privacy and safety

The app never holds anything that could be used to spend on your cards.

- Store only card name and last 4 digits. Never the full number, CVV,
  expiry, PIN or OTP.

- The SMS parser must ignore OTP messages entirely.

- Keep data on the phone; backups go to a file you control.

- Store the Claude API key and statement passwords in the phone's secure
  storage.

- Send only statement text to the AI, never images of cards.

- Lock the app with fingerprint; add it to Prompt 4 in Phase 1.

## Open questions

- [x] Tata Neu HDFC: Plus

- [x] Adani One ICICI: Platinum

- [x] IndusInd: CRED IndusInd (RuPay + JCB)

- [ ] Statement day and due gap for each card (from one recent
  statement)

- [ ] Any add-on cards, and for whom

- [ ] Debit cards to include later, and which benefits matter on them

- [ ] Which lounge gates you can realistically hit each quarter
