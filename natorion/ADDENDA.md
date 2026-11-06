# Addenda · Isometric & Long Cycles

**Page:** [`isometric.html`](isometric.html) · **Code:** [`js/chronicon/addenda.js`](js/chronicon/addenda.js) (`NC.addenda`) · **Test:** [`tests/addenda.js`](tests/addenda.js)

Addenda are community findings you can switch on and off. Switched on, an addendum's dates join the Chronicon's event ledger (the **Addenda** filter on the Chronicon screen), and its claims are checked on the page: ✓ where the arithmetic or the sky bears them out. Nothing here changes a projected date, a match or a strength on the Cipher screen.

The page also gives you the tools to test findings like them on your own dates:

| Tool | What it does |
|---|---|
| **Gaps** | Years between every pair of dates, flagged when a whole multiple of a switched-on cycle, with "same day & month" marked. |
| **Isometric centres** | The year exactly midway between two dates, when another date or a ledger event sits on it. |
| **Years to the ledger** | How many ledger events sit a whole number of cycles from each date, against the years around it. |
| **The sky** | Sun, Moon and the five planets by sign and degree at 0h UT, the largest gathering in one sign, and any solar or lunar eclipse within three days. Year-only dates list that year's solar eclipses. |

Cycles you can switch on: **19** (Metonic), **100**, **138** (Phoenix), **434** (Judged Time), **600** (NER), **1900**, **2170**.

## Addendum 1 · Yvonne Love, 4 Nov 2026

*1900 years! 62 A.D. to 1962 A.D. — an isometric projection clue*, from Jason Breshears' *Anunnaki Homeworld* audiobook (ch. 8, Archive 7 Romanid, read by Grendel Dark).

Every year-count in it checks out:

| Claim | Check |
|---|---|
| 62 CE → 1962 CE is 1900 years, same day (5 February) | ✓ 1900 |
| 59 CE → 1962 CE is 1903 years | ✓ 1903 |
| 4039 BC + 1900 = 2139 BC | ✓ (no year zero handled) |
| 2239 BC (Flood) + 100 = 2139 BC | ✓ |
| 4309 BC → 2139 BC → 32 CE, 2170 + 2170 = 4340 = 10 × 434 | ✓ |

And so do the sky claims, computed independently here with Astronomy Engine:

- **5 Feb 1962, 0h UT:** Sun 15°42′, Moon 15°36′, Mercury 16°55′, Venus 17°45′, Mars 2°21′, Jupiter 18°36′, Saturn 3°48′, all in Aquarius — within one arcminute of the ephemeris she quotes — and a **total solar eclipse** at 00:12 UT.
- **59 CE:** a **total solar eclipse on 30 April 59 (Julian)**, which fits "the Sun darkened over Rome".

### What the tools found beyond it

- **1900 = 19 × 100.** The 62 → 1962 span is also a whole number of your lucky 19s.
- **2170 = 5 × 434.** Each half of the 4340-year chain is itself five Judged Time periods.
- **1039 BC is an isometric centre twice over:** exactly 1100 years from both 2139 BC and 62 CE, and exactly 3000 years from both 4039 BC and 1962 CE. The Chronicon ledger has David's birth in 1039 BC.

### Reading it fairly

- **Grids.** Much of the Chronicon ledger sits on regular cycles. The 600-year NER nodes all fall on years ending in 62 CE or 39 BC (… 438 BC, 162, 762, 1362, 1962). So 62 CE, 1962, 2139 BC and 4039 BC each sit a whole number of centuries from a dozen or more ledger events: they beat about 99% of the years around them, while 61 CE scores 4 to 62 CE's 20. That is the grid at work, and 62 → 1962 is itself a grid relation: 1900 = 3 × 600 + 100. Equally spaced triples of ledger events are built in the same way (228 in the ledger against about 12 for random years), so they are not independent evidence either.
- **Selection.** Dates picked because they fit cannot test themselves. The chance figures mean most on dates you gathered before looking for the pattern.
- **Calendars.** 5 Feb 62 is a Julian date (3 Feb on the Gregorian calendar); 5 Feb 1962 is Gregorian. "Same day and month" across 1900 years crosses the two calendars. The Sun is in the same sign on the same calendar day every year, so a shared Sun sign on an anniversary is a calendar fact; the gathering of all seven bodies is the rare part.

## Adding an addendum

Each addendum is one entry in `ADDENDA` in `js/chronicon/addenda.js`: its title, author, date written, source, its dated events (astronomical years: 1 BC = 0, 2 BC = −1; Julian dates before 15 Oct 1582), and its chains of years. Send Claude the write-up and it adds the entry and its checks.
