# Natorion Cipher — User Manual

*Seed the controls. Cast them. Read what survives.*

This manual assumes you have never used Ophis, never written a formula, and just want to get useful results. It comes in nineteen short chapters. Read 1–5 to get going; the rest is there when you need it.

**Contents**

1. [What this is](#1-what-this-is)
2. [Opening the app](#2-opening-the-app)
3. [A tour of the screen](#3-a-tour-of-the-screen)
4. [Your first projection](#4-your-first-projection)
5. [Reading the Z-Dates table](#5-reading-the-z-dates-table)
6. [How a Z-Date is made — a worked example](#6-how-a-z-date-is-made--a-worked-example)
7. [Scores, hits and MSRF numbers](#7-scores-hits-and-msrf-numbers)
8. [The timeline](#8-the-timeline)
9. [Filters](#9-filters)
10. [T-Dates: asking about one particular day](#10-t-dates-asking-about-one-particular-day)
11. [Days scope and HH:MM · sunset scope](#11-days-scope-and-hhmm--sunset-scope)
12. [Operations: the sixteen formulas](#12-operations-the-sixteen-formulas)
13. [Writing your own formula](#13-writing-your-own-formula)
14. [Several events in one document](#14-several-events-in-one-document)
15. [Opening, saving and exporting](#15-opening-saving-and-exporting)
16. [The Chronicon](#16-the-chronicon)
17. [Resonance marks: palindromes, 19 and 138](#17-resonance-marks-palindromes-19-and-138)
18. [Settings, keyboard and phone use](#18-settings-keyboard-and-phone-use)
19. [Troubleshooting and questions](#19-troubleshooting-and-questions)

---

## 1. What this is

Natorion Cipher is a **date-projection** tool. It takes dates that mattered in the past and, using a fixed set of number patterns, points to dates in the future that "rhyme" with them.

It is a faithful rebuild of **Ophis v12**, the desktop app built around the work of Jason Breshears (Archaix). The same inputs give the same results as the original. It runs in a browser instead of as a Windows program, and it adds the **Chronicon**, a calendar and cycle explorer.

A few words you'll see everywhere:

| Word | Plain meaning |
|---|---|
| **X-Date** | A date you put in. An anchor. |
| **Y** | The number of days between two of your X-Dates. |
| **Operation** | A small formula that turns Y into another number of days. |
| **Z** | The number an operation gives back. |
| **Z-Date** | X-Date + Z days. A projected date. |
| **MSRF** | A list of special numbers. A Z that matches one scores extra. |
| **T-Date** | A target date you want to test. Optional. |

---

## 2. Opening the app

**On the web:** go to [bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine](https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/) and click **Open the app**. Your work is kept in that browser, exactly as it is when you run it from a folder.

**From a folder:**

1. Open the **`natorion`** folder.
2. Double-click **`index.html`**.

Your browser opens the app. There is nothing to install and no login. Opened from the folder, it works without internet; only the decorative fonts need a connection, and plain fonts stand in without one. (The web address needs a connection to load.)

If double-clicking opens something other than a browser, right-click the file, choose **Open with**, and pick Chrome, Edge, Firefox or Safari.

> **Tip:** bookmark the page once it's open, so you can come back to it in one click.

---

## 3. A tour of the screen

Along the top:

- **NATORION** — the name.
- **Cipher · Operations · Chronicon · Files · Guide** — the five screens.
- **Event picker** (drop-down, top right) — switch between events, or pick **+ New event**.
- **Saved** — your work is stored in this browser. It says "Saving…" for a moment after each change.
- **◐** — switch between dark and light.

On the **Cipher** screen:

- **Left column** — everything you type in: the event's name, scope, X-Dates, T-Dates, filters, timeline layers and notes.
- **Right column** — the results: a status line, the timeline, and the Z-Dates table.

The status line reads like this:

> **15** Y-pairs · **16** operations · **230** Z-Dates projected, **146** shown · UTC days · 9 ms

That means 15 pairs of dates were compared, 16 formulas were used, 230 projections came out, and 146 of them passed your filters.

---

## 4. Your first projection

The app opens with an example (six dates from July 2026 to April 2028), so there is something on screen straight away. To use your own dates:

1. On **Cipher**, find **X-Dates**.
2. Click a date box and pick a date from the calendar, or type it.
3. To add another, click **+ Add**. The new one starts a day after the last.
4. To remove one, click **✕**. To switch one off without deleting it, untick its box.
5. Keep them **oldest first**. The small grey line under each date shows the gap to the one before it, e.g. *+47 days from the previous date*. The **↑** button moves a date up.

**Pasting many dates at once:** click **Paste…** and paste a list. All of these work:

```
07/04/2026, 08/20/2026, 03/09/2027
2026-07-04
07/04/2026 18:30
7-4-26-8-20-26-3-9-27          ← the file-name style
```

Leave **Replace the current X-Dates** ticked to start fresh, or untick it to add to what's there.

The results update by themselves about a fifth of a second after you stop typing.

---

## 5. Reading the Z-Dates table

Each row is one projected day.

| Column | What it tells you |
|---|---|
| **#** | Its position in the current sort. |
| **Z-Date** | The day, with the weekday underneath. In HH:MM scope, the sunset-to-sunset window. |
| **+Days** | Days after your last X-Date. |
| **Score** | Strength. See chapter 7. |
| **Hits** | How many things landed on this day: ● 1 · ▲ 2 · ◆ 3 · ★ 4+. |
| **MSRF** | Special numbers matched, colour-coded: blue normal, gold important, red vortex. |
| **Operations** | Which formulas produced it, by number. A solid outline is worth a full point (alpha); a dashed one half a point (beta). Hover to see the formula. |
| **Marks** | Extra signs from the Chronicon. See chapter 17. |

**Sort** (top of the table): *Date* (soonest first), *Score* (strongest first), *MSRF* (most special-number weight first), *Hits* (most hits first) or *Operations* (most formulas first).

**Find…** narrows the table: type `2028` for rows in 2028, or `1656` for rows matching that MSRF number.

**Click a row** (or press Enter on it) to open its **derivation** on the right. It lists every formula that landed on the day, from which two X-Dates, with what Y and what Z. It also shows exactly how the score adds up. From there you can:

- **Open in Chronicon** — see that day on every calendar;
- **Add as X-Date** — use it as a new anchor;
- **Add as T-Date** — test it as a target.

---

## 6. How a Z-Date is made — a worked example

Take two X-Dates: **X1 = 07/04/2026** and **X2 = 08/20/2026**.

1. **Y** is the days between them: **47**.
2. Operation **#9** is `X2 + Y x OPH_PHI`: "start from X2, add Y times 1.618."
3. **Z** = 47 × 1.618 = **76.05** days.
4. **Z-Date** = 08/20/2026 + 76 days = **11/04/2026**.
5. Z rounds to **76**, which is on the Normal MSRF list, so the day scores extra.

The same pair feeds all sixteen operations. #2 reverses the digits of 47 to get 74 and lands on 11/02/2026 (74 is also on the list). #1 simply adds 47 days to X2, landing on 10/06/2026. With more X-Dates there are more pairs: six dates make 15 pairs, and 15 pairs × 16 formulas give up to 240 projections. When several land on the **same day**, they merge into one row, and that row's score climbs.

> A small precision note, kept from the original: 76.05 rounds to 76.1, exactly 0.1 from the vortex number 76.2, on the very edge of its ±0.1 window. In the computer's floating-point arithmetic, 76.2 − 76.1 comes out a hair over 0.1 (0.10000000000000853), so it counts as the normal number 76, not the vortex. Natorion reproduces Ophis v12's arithmetic exactly, down to cases like this.

---

## 7. Scores, hits and MSRF numbers

**Hits** simply count: each formula that lands on the day is one hit, and each MSRF match is one more.

**Score** weighs them:

- Each **alpha** formula hit: **+1**.
- Each **beta** formula hit: **+½**.
- Each MSRF match: **+1** (normal) or **+2** (important or vortex).
- Then the best MSRF class **multiplies** the total: **×1.5** normal, **×2** important or vortex. The one match that provides the multiplier is not also added as points.

In the worked example, 11/04/2026 has one alpha hit (1 point) and one normal MSRF match (the multiplier): **1 × 1.5 = 1.5**.

**The MSRF sets** are three fixed lists taken from the original app:

- **Vortex** (12 numbers, matched within 0.1): 21.7, 32.6, 43.5, 65.3, 76.2, 87.1, 217.8, 326.7, 435.6, 653.4, 762.3, 871.2.
- **Important** (53 whole numbers), e.g. 84, 126, 360, 432, 1260, 1656, 2520.
- **Normal** (325 whole numbers), e.g. 12, 138, 144, 365, 666, 1461, 2559.

A Z that ends in exactly **.5** (such as 137.5) matches nothing; the rule is that it leans to neither side. The full lists are in the **Guide** screen under *The three MSRF sets*.

**Scoring system.** Files from Ophis v7 and earlier used plain addition with no multiplier. A file can ask for that older system, and Natorion honours it.

---

## 8. The timeline

The timeline draws everything in the table as a picture.

- **Gold vertical lines** — your X-Dates, labelled X1, X2…
- **Red dotted line** — today.
- **Dashed blue lines** — T-Dates.
- **Stalks** — Z-Dates. Taller means a higher score. The shape on top matches the Hits column (● ▲ ◆ ★), and the colour matches its best MSRF class.
- **Bottom lane** — moon phases and eclipses, when you switch them on (see below).

**Moving around:** scroll the mouse wheel (or pinch) to zoom, drag to slide, and double-click empty space or press **Fit** to see everything. With the timeline selected, the arrow keys slide and **+ / − / 0** zoom.

**Click a stalk** to select that Z-Date. Arcs appear, one from each X-Date that projects onto it; solid arcs are alpha formulas, dashed are beta. **Double-click a stalk** to open its derivation.

**PNG** saves the current view as a picture.

**Timeline layers** (left column) switch parts on and off: the chart itself, the Z labels, each of the eight moon phases, and total or partial solar and lunar eclipses. A moon phase or eclipse appears only when it falls within about a day of one of your X- or Z-Dates.

---

## 9. Filters

Filters hide rows; they never change scores. Open **Filters** in the left column.

| Filter | On by default | Hides… |
|---|---|---|
| Before the last X-Date | ✔ | projections earlier than your last anchor |
| On the last X-Date | ✔ | projections landing on it |
| Before today | ✔ | anything already in the past |
| On today | | anything landing today |
| Beyond N days | ✔ (2559) | anything more than N days after your last X-Date |
| Hits below N | | rows with fewer than N hits (2 is a good choice) |
| Score below N | | rows scoring under N |
| No MSRF match | | rows without an MSRF match |

**Tip:** to see only the strong dates, tick **Hits below 2** and **No MSRF match**.

If the table is empty and says *Every projection was filtered out*, loosen a filter; **Before today** and **Beyond N days** hide the most.

---

## 10. T-Dates: asking about one particular day

A **T-Date** (target date) asks: *does anything land on this day?*

Add one under **T-Dates**. While at least one T-Date is ticked, the table shows **only** Z-Dates that fall on a T-Date. An empty table means nothing lands there. Untick the T-Date to go back to seeing everything.

---

## 11. Days scope and HH:MM · sunset scope

Under **Event → Scope** there are two ways to count:

**Days** (the default). Dates are whole calendar days, counted in UTC exactly as Ophis did. **Day begins at (UTC)** can shift where each day starts, for advanced use.

**HH:MM · sunset.** This follows the ancient reckoning in which a day begins at sunset:

- Each X-Date gets a **time**, read as local time at the event's place.
- Y counts **sunsets** between dates instead of midnights.
- Each Z-Date becomes a **window** from one sunset to the next, e.g. *04/08/2028 19:53 → 04/09/2028 19:53*.

Choose the place by typing **Latitude** and **Longitude**, or pick from **Place** (Giza, Jerusalem, Dallas, London, Tokyo and around fifty more). The **Time zone** shows what the app worked out from that position. Latitude is limited to 65° north or south, because the sun behaves too strangely near the poles for "sunset" to mean one moment a day.

HH:MM takes a moment longer, since it calculates real sunsets.

---

## 12. Operations: the sixteen formulas

The **Operations** screen lists the current event's formulas. The standard sixteen from Ophis v12:

| # | Formula | Says | Class |
|---|---|---|---|
| 1 | `X2+oph_round(Y)` | X2 plus Y — the isometric date | alpha |
| 2 | `X2+oph_flip(oph_round(Y))` | X2 plus Y with its digits reversed | alpha |
| 3 | `X2+Y/OPH_CRV` | X2 plus Y ÷ 5.08 | beta |
| 4 | `X1+(Y/2.0)xOPH_PI` | X1 plus half of Y × 3.14 | beta |
| 5 | `X2+Y/OPH_PHI` | X2 plus Y ÷ 1.618 | alpha |
| 6 | `X2+(Y/2.0)xOPH_PHI` | X2 plus half of Y × 1.618 | alpha |
| 7 | `X1+(Y/2.0)xOPH_CRV` | X1 plus half of Y × 5.08 | beta |
| 8 | `X2+(Y/2.0)xOPH_PI` | X2 plus half of Y × 3.14 | beta |
| 9 | `X2+YxOPH_PHI` | X2 plus Y × 1.618 | alpha |
| 10 | `X1+YxOPH_PI` | X1 plus Y × 3.14 — the radius projection | alpha |
| 11 | `X2+(Y/2.0)xOPH_CRV` | X2 plus half of Y × 5.08 | beta |
| 12 | `X2+YxOPH_PI` | X2 plus Y × 3.14 | beta |
| 13 | `X1+YxOPH_CRV` | X1 plus Y × 5.08 | beta |
| 14 | `X2+YxOPH_CRV` | X2 plus Y × 5.08 | beta |
| 15 | `X1+YxOPH_HEP` | X1 plus Y × 7.01 — hepta-cycle | alpha |
| 16 | `X2+YxOPH_HEP` | X2 plus Y × 7.01 — hepta-cycle | alpha |

On this screen you can:

- **Tick or untick** a formula to use it or not.
- **Edit** it by typing. A red message explains any mistake.
- Change its **Class** to alpha (1 point) or beta (½ point).
- **↑** move it up, **⎘** duplicate it, **✕** remove it.
- **Add extras 17–26** — ten more formulas from the Ophis community list (Y × 2.718, × 1.38, × 5.52, × 2.178, × 0.360 …).
- **Restore the 16 defaults** — undo all your changes.

The **Z at Y=100** column shows what each formula gives when Y is 100, as a quick sanity check.

Two identical formulas are not allowed; the second one is flagged and skipped.

---

## 13. Writing your own formula

A formula always starts with **`X1+`** (count from the earlier date of the pair) or **`X2+`** (count from the later one). After that, you can use:

| You write | It means |
|---|---|
| `Y` | the days between the pair |
| numbers | `2`, `0.5`, `3.14` |
| `+  -  *  /` | add, subtract, multiply, divide |
| `x` (lower-case) | multiply, the way Jason writes it |
| `^` | power: `Y^2` is Y squared |
| `%` | remainder |
| `( )` | grouping |
| `OPH_PI` `OPH_PHI` `OPH_CRV` `OPH_HEP` | 3.14, 1.618, 5.08, 7.01 |
| `oph_round(…)` | round to a whole number |
| `oph_flip(…)` | reverse the digits: 138 → 831 |
| `oph_sqrt` `oph_abs` `oph_floor` `oph_ceil` `oph_log` `oph_exp` `oph_sin` `oph_cos` `oph_tan` | the usual maths |

Examples:

```
X2+Y x 2.718             X2 plus Y times e
X1+oph_sqrt(Y) x 19      X1 plus the square root of Y, times 19
X2+oph_flip(Y) / 2       X2 plus half of Y reversed
```

The formula must give a number above zero when Y is 10, or it is flagged.

**Try one** at the bottom of the screen tests a formula on any Y. It shows the result and whether it hits an MSRF number. Put in `X2+oph_flip(oph_round(Y))` with Y = 138 and you get 831: 138 in the mirror.

> **Safe by design.** Formulas are read by a strict little grammar and never run as program code. A shared `.oph` file can't make the app do anything except arithmetic. The original Ophis could be tricked this way; Natorion can't.

---

## 14. Several events in one document

A document can hold many **events**. Each is a separate set of X-Dates with its own settings: one for markets, one for a family history, one for a historical sequence.

- **Switch** with the drop-down at the top right.
- **Add** with **+ New event** (in that drop-down, or on **Files**).
- On **Files → Events in this document** you can rename, open, duplicate or delete events.

**Apply settings to other events** (on Files) copies the current event's formulas, filters, timeline layers, scope or sort onto the events you tick. It's handy after you've tuned one event just the way you like.

---

## 15. Opening, saving and exporting

**Automatic saving.** Every change is kept in this browser. Close the tab, come back tomorrow, and it's all there.

> This copy lives only in this browser on this computer. Clearing browsing data or using a private window can remove it. **Save a file** for anything that matters.

**Save a file:** **Files → Save .oph** (or **Ctrl+S** / **⌘S**). Give it a name first under **File name**. **Readable** saves a neat file you can read; **Minified** makes the smallest file, leaving out anything at its default.

**Open a file:** **Files → Choose .oph…** (or **Ctrl+O**), or drag a `.oph` file anywhere onto the page. Files from the original Ophis app open as they are.

- **Replace these events** swaps in the file's events; **Add to them** appends them.
- **Checking** decides how fussy to be about damaged files. **Loose** repairs what it can and tells you what it fixed. **Original** behaves like Ophis v10. **Strict** refuses anything imperfect.
- **Paste text instead** lets you paste a file's contents directly.

**Export results** of the current event:

- **Results CSV** — opens in any spreadsheet.
- **Results .xls** — opens straight in Excel, LibreOffice or Numbers.
- **Print** — prints the Cipher screen.
- **PNG** (on the timeline) — a picture of the chart.

**Document text** shows the raw file, with a **Copy** button.

---

## 16. The Chronicon

The **Chronicon** screen shows any single day through every lens at once.

**Living clocks** (top): UTC, your own clock, Cairo's civil time, the true solar time over the Great Pyramid, and a countdown to **15 May 2040**. The countdown notes when its day-count is divisible by 19 or 138.

**The dial.** Choose **CE / BC**, a year, month and day; drag the long slider through history; or jump straight to a key year (4309 BC, the Flood, 713 BC, 522, 864, 1254, 2040, 2046, 2178 …). **Today** comes back to now.

Under the dial:

- **The moment** — the year, its **Annus Mundi** (years since 3895 BC), years since the Cataclysm, and the Long-Count year.
- **The cycles**, each with a progress bar: **Annus Mundi** toward AM 6000; the **Phoenix** 138-year grid; **Nemesis X** on its 792-year loop with a 60-year inner transit; the **NER** 600-year periods; and the **Maya baktun**.
- **The moon** — a drawing of that day's phase, its age, how much is lit, the lunation number, and how many moons and Metonic 19-year cycles separate it from today.
- **Resonance** — flags that light up for a Phoenix node year, a Metonic match with this year, a mirror year, and "138" in the Long Count.
- **Z-Dates in this year** — every projection from your current event that falls in the year on the dial. Click one to jump to it.
- **The calendar wall** — the day on **nineteen** calendars: Gregorian, Anunna turnings, Hebrew, Egyptian civil, Maya, Julian, Julian Day, Islamic, Persian, Indian, Coptic, Ethiopic, Buddhist, Chinese sexagenary, Byzantine, Kali Yuga, Holocene, French Republican and Unix.
- **The event ledger** — the Archaix chronology from 5239 BC to 2178, filterable by Phoenix, Nemesis, NER, Baktun or key events. Click a row to set the dial to that year.

**The bridge.** **Use as X-Date** adds the dial's day to your current event. From any Z-Date's derivation, **Open in Chronicon** comes the other way.

**The Dossier.** Below the ledger sit the eight written chapters of the Chronicon, kept as written: the Instrument; the Stone in Annus Mundi, with the four renders of the Great Pyramid commenced, capped, drowned and re-emerged; Petrie ↔ Breshears, with the table where the surveyor's measures meet the calendar; the Sigil in the Odometer (5138, the 138-faced year); the numbers that fold; the Convergence; the cornerstone (who Jason Breshears is); and the Anunna reckoning and the calendar wall. Click a chapter's title to open it. The figures that depend on today — AM of today, years to 2040 and 2046, the days left in the 138-faced year — are live.

> The Chronicon presents the Archaix thesis of Jason Breshears as a study and worldbuilding instrument, not as established history. The Egyptian, Maya, French Republican and Chinese readings are arithmetic approximations; the others come from your browser's own calendar tables.

---

## 17. Resonance marks: palindromes, 19 and 138

The **Marks** column of the Z-Dates table adds four kinds of sign:

| Mark | Meaning |
|---|---|
| **⮌** | The date written as MMDDYYYY reads the same backwards. 02/02/2020 → 02022020. |
| **19** | The day is a whole multiple of 19 days from today. 19 is the Metonic number: 19 years hold 235 moons. |
| **138** | The day is a whole multiple of 138 days from today. 138 is the Phoenix step. |
| 🌑 🌕 ◉ ◐ ⬤ ◑ | A new moon or a full moon falls within a day, or an eclipse does: ◉ total and ◐ partial solar, ⬤ total and ◑ partial lunar. |

Marks don't change the score. They are a second reading laid over the first. The derivation panel spells them out, e.g. *266 days = 19 × 14*.

Mirrors turn up everywhere once you look: 19 and 91, 138 and 831. Formula #2, `oph_flip`, is itself a mirror; it reads Y backwards.

---

## 18. Settings, keyboard and phone use

**Files → Settings:**

- **Treat "today" as** — pretend today is another date. The *Before today* filter and the 19/138 marks use it. Leave it empty for the real date.
- **Recalculate as I type** — on by default.
- **Start over** — clears this browser's copy of your events and settings (only the light/dark choice stays) and reloads the example. Save a file first.

**Keyboard:**

| Keys | Does |
|---|---|
| **Ctrl+S** / **⌘S** | Save .oph |
| **Ctrl+O** / **⌘O** | Open .oph |
| **Tab**, **Enter** | Move through controls, open a row |
| **↑ ↓** in the table | Move between rows |
| **← → + − 0** on the timeline | Slide, zoom in, zoom out, fit |
| **Esc** | Close the derivation panel |

**On a phone or tablet** everything stacks into one column: inputs first, then the timeline and table. Pinch the timeline to zoom.

**Light and dark:** the **◐** button. The app follows your device's setting until you choose.

---

## 19. Troubleshooting and questions

**"At least 2 X-Dates are required."** Add a second date and make sure both are ticked.

**"X2 must come after X1."** Your dates are out of order. Use ↑ to sort them oldest first.

**"X1 and X2 must be different days."** Two dates are the same day (or, in HH:MM scope, fall between the same two sunsets).

**"At least 1 Operation is required."** Every formula is off or broken. Go to Operations and tick some, or click **Restore the 16 defaults**.

**"HH:MM scope needs a latitude within ±65°…"** Fix the latitude or longitude, or pick a place from the list.

**The table is empty.** Read the message in it. Usually a filter is hiding everything (chapter 9) or a T-Date is on (chapter 10).

**A formula is red.** Read the message beneath it. Common slips: a missing bracket, a capital `X` in the middle, or a name the app doesn't know.

**My work is gone.** The browser copy was cleared, or you used a private window. Open your last `.oph` file. From now on, **Ctrl+S** now and then.

**It says "Not saved" at the top.** This browser won't let pages store anything (common in private windows). Everything still works; save a file before you close.

**Are the results the same as the original Ophis?** Yes. The test `tests/parity.js` runs the original Ophis v12 code and Natorion side by side. In the last run, all 1,003 test cases matched, down to every date, score and hit. The deliberate differences are safety fixes, more accurate astronomy, and up-to-date time zones (the original ships 2023 zone data); the **Guide** screen lists them.

**Does it send anything anywhere?** No. It runs entirely in your browser. The only outside request is for the display fonts, and the app works without them.

**Does it predict the future?** It is a study instrument for the number patterns in Jason Breshears' work. It shows where those patterns point; it makes no claim that they predict anything.

---

*Nineteen chapters, one loop: seed the dates, cast the numbers, read what survives — read, cast, seed.*
