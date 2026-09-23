/* NATORION · chronicon/chronicon.js
   The Chronicon Calendrics & Clocks engine, as pure functions: no DOM here.

   Years are astronomical: 1 BC = 0, 2 BC = −1, so a BC year B is 1 − B.
   Annus Mundi: AM = astro + 3894 (Year One = 3895 BC).
   The cycle grids and the event ledger follow the Archaix composite
   chronology of Jason Breshears, as the original Chronicon page set them. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});

  function mod(n, m) { return ((n % m) + m) % m; }
  function isPal(n) { var s = String(Math.abs(Math.round(n))); return s.length > 1 && s === s.split("").reverse().join(""); }
  function nextPal(n, limit) { var x = Math.round(n); for (var i = 0; i < (limit || 200000); i++, x++) if (isPal(x)) return x; return null; }
  function fmtYear(a) { return a <= 0 ? (1 - a) + " BC" : a + " CE"; }
  function astroFrom(year, era) { return era === "bc" ? 1 - Math.abs(year) : year; }

  // Proleptic Gregorian Julian Day Number of a civil date.
  function jdn(y, m, d) {
    var a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  function fromJdnJulian(jd) {
    var c = jd + 32082, d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
    return { y: d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1 };
  }
  // Noon UTC of an astronomical-year civil date, as epoch ms.
  function noonMs(y, m, d) { var dt = new Date(Date.UTC(2000, 0, 1, 12)); dt.setUTCFullYear(y, m - 1, d); return dt.getTime(); }
  function toRoman(n) {
    if (n <= 0 || n > 3999) return String(n);
    var M = ["", "M", "MM", "MMM"], Cc = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"], X = ["", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"], I = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
    return M[Math.floor(n / 1000)] + Cc[Math.floor(n % 1000 / 100)] + X[Math.floor(n % 100 / 10)] + I[n % 10];
  }

  /* ------------------------------------------------------ cycle grids -- */
  var PHX = { residue: 108, step: 138, base: -4308 };            // 4309 BC = node 1
  var NEM = { residue: 462, step: 792, inner: 60 };               // enters the inner system; 60-yr transit
  var NER = { residue: 162, step: 600, base: -5238 };             // 5239 BC
  var BAKTUNS = [-3112, -2712, -2312, -1912, -1512, -1112, -712, -318, 76, 470, 864, 1258, 1652, 2046];

  function cycles(a) {
    var out = { astro: a, am: a + 3894, cat: a + 5238, lc: a + 3112 };
    var pPrev = a - mod(a - PHX.residue, PHX.step);
    out.phoenix = { prev: pPrev, next: pPrev + PHX.step, into: a - pPrev, to: pPrev + PHX.step - a, node: Math.round((pPrev - PHX.base) / PHX.step) + 1, at: mod(a, PHX.step) === PHX.residue };
    var off = mod(a - NEM.residue, NEM.step), enter = a - off;
    out.nemesis = { inner: off < NEM.inner, offset: off, enterPrev: enter, enterNext: enter + NEM.step, exit: enter + NEM.inner,
      progress: off < NEM.inner ? off / NEM.inner : (a - (enter + NEM.inner)) / (NEM.step - NEM.inner) };
    var nOff = mod(a - NER.residue, NER.step);
    out.ner = { period: Math.floor((a - NER.base) / NER.step) + 1, start: a - nOff, next: a - nOff + NER.step, off: nOff };
    var bi = -1;
    if (a >= BAKTUNS[0]) { bi = BAKTUNS.length - 1; for (var k = 0; k < BAKTUNS.length - 1; k++) if (a >= BAKTUNS[k] && a < BAKTUNS[k + 1]) { bi = k; break; } }
    if (bi >= 0) {
      var bs = BAKTUNS[bi], be = BAKTUNS[bi + 1] || 2046;
      out.baktun = { n: bi + 1, start: bs, end: be, span: be - bs, into: a - bs, progress: be > bs ? (a - bs) / (be - bs) : 1 };
    } else out.baktun = null;
    return out;
  }

  /* ------------------------------------------------------------ ledger -- */
  // [astronomical year, kind, event]. kinds: key, phx, nem, ner, may, note.
  var LEDGER = [
    [-5238, "key", "Nemesis Cataclysm — Nemesis implodes; Earth, Luna, Phoenix, Nemesis X & Electra hurled toward Sol"],
    [-4638, "ner", "Earth captured in orbit around Sol — exactly 600 yr after the Cataclysm"],
    [-4308, "phx", "Phoenix named (Trimorphic Protennoia); 930-yr Adamu civilization destroyed, dust hides the sun"],
    [-4038, "key", "Capture of Luna — the Capture Flood; Moon arrives from the dead Nemesis system"],
    [-3894, "phx", "Lithospheric displacement, 30° poleshift — New Heavens & New Earth; YEAR ONE of the Ancient calendar"],
    [-3438, "nem", "Gihon Flood — a third of mankind dies; ENKI arrives with the Anunna; Nemesis X Passover"],
    [-3372, "note", "Olmec calendar begins"],
    [-3112, "may", "Impact in North America — Maya Long-Count 0.0.0.0.0 begins the countdown"],
    [-3102, "note", "Vedic Kali Yuga calendar begun"],
    [-2908, "note", "Enoch vanishes into the sky"],
    [-2838, "key", "Noah born"],
    [-2814, "note", "Great Pyramid of Giza built at Achuzan, where Enoch vanished"],
    [-2712, "may", "Mayan baktun (144,000 days) ends & begins"],
    [-2652, "phx", "Sitchin’s major disaster recorded in Near East texts"],
    [-2646, "nem", "Nemesis X Object departs Sol — begins 732 yr away; Anunna Exodus / 408-yr Shock Period"],
    [-2312, "may", "Mayan baktun ends & begins"],
    [-2238, "key", "THE GREAT FLOOD — May, Annus Mundi 1656; Vapor Canopy collapse, Birth of the Sun"],
    [-1962, "phx", "Temporary poleshift, quakes, bodies of water moved"],
    [-1914, "nem", "Nemesis X returns — Tiamat passes, blackness swallows the stars (32nd yr of Nimrod)"],
    [-1912, "may", "Mayan baktun ends & begins"],
    [-1854, "nem", "60th year of Nemesis inner transit — Sumer vanishes, Akkad rises"],
    [-1848, "note", "Sodom & Gomorrah, Mohenjo-daro destroyed in fallout"],
    [-1686, "phx", "The Ogygian Flood — 25-yr darkness & famine, Heliolithic empire collapses"],
    [-1638, "note", "Jacob (Israel) dies in Egypt"],
    [-1548, "phx", "Three suns shone, sun dimmed, red sky, tsunamis"],
    [-1512, "may", "Mayan baktun ends & begins"],
    [-1410, "phx", "Temporary poleshift; new star; sky bloody red; Israel born / Conquest of Canaan"],
    [-1272, "phx", "Atreus predicts sun-darkening; sky bloody red (Seneca, Euripides, Mursilis II)"],
    [-1134, "phx", "Cataclysm — Mediterranean Dark Age begins, Linear B collapses"],
    [-1122, "nem", "Nemesis X returned — China records an attack on the sun, Shang collapse"],
    [-1112, "may", "Mayan baktun ends & begins"],
    [-1038, "note", "David, giant-slayer & future King of Israel, born"],
    [-996, "phx", "Large meteorite impact, North America (Badlands)"],
    [-858, "phx", "Phoenix symbol on Assyrian relief of King Jehu"],
    [-720, "phx", "Kingdom of Israel falls to Assyria; sun & moon darkened, flames in sky"],
    [-712, "may", "713 BC — flux-tube blast vaporizes 185,000 Assyrians; orbit 360→365.25 d; baktun reset"],
    [-582, "phx", "Thales predicts the darkening of the sun, in May"],
    [-444, "phx", "deJonge’s comet disaster, widespread fires"],
    [-438, "ner", "Parthenon / Titanomachy commemorated — the War of the Giants, the gods"],
    [-330, "nem", "Nemesis X returns — Moon dims, sky blood-red; Alexander takes Babylon"],
    [-318, "may", "Mayan baktun ends & begins"],
    [-306, "phx", "Oera Lindh text records disasters across Europe"],
    [-270, "nem", "Nemesis X totally eclipses Venus on its way out (recorded by the Ptolemies)"],
    [-30, "phx", "31 BC — continental quake Aegean→Judea during Battle of Actium; sky dragon over Egypt"],
    [76, "may", "Mayan baktun ends & begins"],
    [162, "ner", "Pandemic afflicts China 11 yr, spreads to Rome 16 yr; Han Dynasty falls"],
    [246, "phx", "Bloody sword in the sky, rain of blood (old Briton annal)"],
    [384, "phx", "Bloody pillar in the sky (Lycosthenes, Chronicon)"],
    [462, "nem", "Nemesis X enters inner system; Statue of Zeus destroyed"],
    [470, "may", "Mayan baktun ends & begins"],
    [522, "phx", "ONLY year Phoenix & Nemesis X are in the inner system together — “celestial war of monsters,” Dark Ages begin"],
    [762, "ner", "6000th year of the NER chronology; Kairite rift, 1st Abbasid year, Maya conclave at Copan"],
    [798, "phx", "Quakes, dark sun, flooding in Mayan cities"],
    [864, "may", "Foundation-of-Time reset — 144,000-day baktun completes; the Maya themselves disappear"],
    [1212, "phx", "Mass human vanishings; quakes in the Middle East"],
    [1254, "nem", "Nemesis X returns — 7th Crusade fails; England–Scotland war lasts the exact 60-yr transit"],
    [1258, "may", "Mayan baktun ends & begins"],
    [1314, "nem", "60th yr of transit — plague fogs, black darkness over Europe; Black Death follows"],
    [1362, "ner", "Norse-Goth expedition of King Magnus surveys North America (Kensington Stone)"],
    [1488, "note", "Mother Shipton born — prophesies the 2040 return of the Sky Dragon"],
    [1626, "phx", "Chinese record sun-darkening, meteoritic rain"],
    [1652, "may", "Mayan baktun ends & begins"],
    [1764, "phx", "Astronomer Hoffman watches a dark object cross 1/5 of the sun, seen by millions"],
    [1902, "phx", "Unknown star, quakes, red rains — Charles Fort’s “other Dark Age”; Tuxtla Statuette found"],
    [1962, "ner", "Close Encounters of the 4th Kind begin; Mars/Moon bases claimed; NER node"],
    [2040, "key", "15/16 MAY — Phoenix darkens the sun; lithospheric displacement; 6th Seal, Black Sun, Fenris"],
    [2046, "key", "Nemesis X returns — “Time collapses,” 16-hr days; Mayan 13.0.0.0.0"],
    [2106, "nem", "Nemesis X exits the system — Annus Mundi 6000"],
    [2178, "key", "Simulation Collapse — 138 yr after the 2040 reset; exodus into the Real universe"]
  ];
  function ledgerMarks(a) {
    return { phx: mod(a, 138) === 108, nem: mod(a - 462, 792) < 60, may: BAKTUNS.indexOf(a) >= 0 };
  }

  /* ----------------------------------------------------- the calendars -- */
  var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function intl(ms, cal, opts) {
    try { return new Intl.DateTimeFormat("en-US-u-ca-" + cal, Object.assign({ timeZone: "UTC" }, opts || { year: "numeric", month: "short", day: "numeric" })).format(new Date(ms)).replace(/\s+ERA\d+$/, ""); }
    catch (e) { return "—"; }
  }
  function intlYear(ms, cal) {
    try {
      var parts = new Intl.DateTimeFormat("en-US-u-ca-" + cal, { timeZone: "UTC", year: "numeric" }).formatToParts(new Date(ms));
      for (var i = 0; i < parts.length; i++) if (parts[i].type === "year" || parts[i].type === "relatedYear") return parseInt(parts[i].value, 10) || 0;
    } catch (e) { /* unsupported */ }
    return 0;
  }
  var AM_EPOCH = jdn(-3894, 1, 1);

  /* Nineteen readings of one day. */
  function calendars(a, m, d) {
    var ms = noonMs(a, m, d), J = jdn(a, m, d), out = [];
    function add(name, big, meta, tone) { out.push({ name: name, big: big, meta: meta, tone: tone || "" }); }
    var leap = (a % 4 === 0) && (a % 100 !== 0 || a % 400 === 0);
    add("Gregorian", d + " " + MN[m - 1] + " " + fmtYear(a), (leap ? 366 : 365) + "-day year" + (leap ? " · leap" : "") + " · day " + (J - jdn(a, 1, 1) + 1));

    var turns = J - AM_EPOCH, T = Math.abs(turns), node = "";
    if (T === 432000) node = " · ✦ the antediluvian 432,000";
    else if (T === 864000) node = " · ✦ Foundation of Time";
    else if (T > 0 && T % 144000 === 0) node = " · ✦ " + (T / 144000) + " baktun";
    add("Anunna turnings", (turns < 0 ? "−" : "") + T.toLocaleString("en-US"), "days since AM Year One · " + (T / 360).toFixed(1) + " Draconian yr of 360 · " + (T / 216000).toFixed(2) + " NER" + node, "red");

    var hy = intlYear(ms, "hebrew"), met = mod(hy, 19) || 19, hLeap = mod(7 * hy + 1, 19) < 7;
    add("Hebrew", intl(ms, "hebrew"), "Anno Mundi " + hy + " · Metonic year " + met + "/19" + (met === 19 ? " ★" : "") + (hLeap ? " · 13 moons" : ""), "gold");

    var ed = J - 1448638, eY = Math.floor(ed / 365) + 1, doy = mod(ed, 365), eM = Math.floor(doy / 30), eD = mod(doy, 30) + 1;
    var egM = ["Thoth", "Phaophi", "Athyr", "Choiak", "Tybi", "Mechir", "Phamenoth", "Pharmuthi", "Pachons", "Payni", "Epiphi", "Mesore"];
    add("Egyptian civil", eM < 12 ? eD + " " + egM[eM] : eD + " epagomenal", "Nabonassar year " + eY + " · Sothic " + mod(a - 139, 1460) + "/1460 · the wandering year");

    var ld = J - 584283;
    var tz = ["Imix", "Ik", "Akbal", "Kan", "Chicchan", "Cimi", "Manik", "Lamat", "Muluc", "Oc", "Chuen", "Eb", "Ben", "Ix", "Men", "Cib", "Caban", "Etznab", "Cauac", "Ahau"];
    var hb = ["Pop", "Wo", "Sip", "Sotz", "Sek", "Xul", "Yaxkin", "Mol", "Chen", "Yax", "Sak", "Keh", "Mak", "Kankin", "Muwan", "Pax", "Kayab", "Kumku"];
    var hp = mod(ld + 348, 365), hM = Math.floor(hp / 20), hD = mod(hp, 20);
    var lcDays = ld, lc = [];
    if (lcDays >= 0) { [144000, 7200, 360, 20, 1].forEach(function (u) { lc.push(Math.floor(lcDays / u)); lcDays = lcDays % u; }); }
    add("Maya", (mod(ld + 3, 13) + 1) + " " + tz[mod(ld + 19, 20)] + " · " + (hM < 18 ? hD + " " + hb[hM] : hD + " Wayeb"), (lc.length ? "Long Count " + lc.join(".") : "before 0.0.0.0.0") + " · Calendar Round 52 yr", "cyan");

    var jc = fromJdnJulian(J);
    add("Julian", jc.d + " " + MN[jc.m - 1] + " " + fmtYear(jc.y), "Old Style · " + (J - jdn(jc.y, jc.m, jc.d)) + " days behind the Gregorian");
    add("Julian Day", J.toLocaleString("en-US"), "since 4713 BC · " + (isPal(J) ? "⮌ palindromic day" : "next palindrome " + (nextPal(J + 1) || "—").toLocaleString("en-US")), isPal(J) ? "gold" : "");
    add("Islamic", intl(ms, "islamic"), "Hijri " + intlYear(ms, "islamic") + " AH · lunar year of 354/355 days");
    add("Persian", intl(ms, "persian"), "Solar Hijri " + intlYear(ms, "persian") + " · from 622 CE");
    add("Indian national", intl(ms, "indian"), "Saka " + intlYear(ms, "indian"));
    add("Coptic", intl(ms, "coptic"), "Year of the Martyrs " + intlYear(ms, "coptic") + " · from 284 CE");
    add("Ethiopic", intl(ms, "ethiopic"), "Amete Mihret " + intlYear(ms, "ethiopic") + " · 13 months");
    add("Buddhist", (a + 543) + " BE", "Buddhist Era · CE + 543");
    var ci = mod(a - 4, 60), st = ["Jia", "Yi", "Bing", "Ding", "Wu", "Ji", "Geng", "Xin", "Ren", "Gui"], br = ["Zi", "Chou", "Yin", "Mao", "Chen", "Si", "Wu", "Wei", "Shen", "You", "Xu", "Hai"];
    var an = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"], el = ["Wood", "Wood", "Fire", "Fire", "Earth", "Earth", "Metal", "Metal", "Water", "Water"];
    add("Chinese sexagenary", st[mod(ci, 10)] + "-" + br[mod(ci, 12)], el[mod(ci, 10)] + " " + an[mod(ci, 12)] + " · year " + (ci + 1) + " of 60 · approximate, turns at the new year");
    add("Byzantine", (m >= 9 ? a + 5509 : a + 5508) + " AM", "Anno Mundi from 1 Sep 5509 BC");
    var ky = a + 3101; add("Kali Yuga", String(ky) + (isPal(ky) ? " ⮌" : ""), "from 3102 BC · the dark age");
    var he = a + 10000; add("Holocene", String(he) + (isPal(he) ? " ⮌" : ""), "Human Era · CE + 10,000");
    var fJ = J - 2375839;
    if (fJ < 1) add("French Republican", "pre-Republic", "before 22 Sep 1792");
    else {
      var fy = Math.floor((fJ - 1) / 365.2422) + 1, fdoy = Math.floor(fJ - 1 - (fy - 1) * 365.2422), fm = Math.floor(fdoy / 30), fday = mod(fdoy, 30) + 1;
      var frM = ["Vendémiaire", "Brumaire", "Frimaire", "Nivôse", "Pluviôse", "Ventôse", "Germinal", "Floréal", "Prairial", "Messidor", "Thermidor", "Fructidor"];
      add("French Republican", fm < 12 ? fday + " " + frM[fm] : fday + " Sansculottides", "An " + toRoman(fy) + " · approximate");
    }
    var ux = Math.round((ms - 12 * 3600000) / 1000);
    add("Unix", ux.toLocaleString("en-US"), "seconds since 1970 at this day's midnight UTC" + (isPal(ux) ? " · ⮌" : ""), "green");
    return out;
  }

  /* ---------------------------------------------------------- flags -- */
  function flags(a, todayYear) {
    var c = cycles(a);
    return {
      node138: mod(a, 138) === 108,
      metonic19: mod(todayYear - a, 19) === 0,
      palindrome: isPal(a <= 0 ? 1 - a : a) || isPal(c.am),
      sigil: c.lc > 0 && String(c.lc).indexOf("138") >= 0
    };
  }

  /* ------------------------------------------------------- living clocks -- */
  var PHOENIX_MS = Date.UTC(2040, 4, 15, 0, 0, 0);
  function dayOfYear(dt) { return Math.floor((Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()) - Date.UTC(dt.getUTCFullYear(), 0, 0)) / 86400000); }
  function pad2(n) { n = Math.floor(n); return (n < 10 ? "0" : "") + n; }
  function hms(ms) { var d = new Date(ms); return pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds()); }
  function clocks(nowMs) {
    var now = new Date(nowMs), out = {};
    out.utc = hms(nowMs);
    out.local = pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds());
    try { out.localZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { out.localZone = "your meridian"; }
    try {
      out.cairo = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
      out.cairoDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(now);
    } catch (e) { out.cairo = "—"; out.cairoDate = ""; }
    // Apparent solar time over the Great Pyramid: longitude plus the equation of time.
    var lon = 31.1342, utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    var B = 2 * Math.PI * (dayOfYear(now) - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var sH = mod(utcH + lon / 15 + eot / 60, 24);
    out.solar = pad2(sH) + ":" + pad2((sH % 1) * 60) + ":" + pad2(((sH * 60) % 1) * 60);
    out.eot = eot;
    var left = PHOENIX_MS - nowMs;
    if (left > 0) {
      var days = Math.floor(left / 86400000), rem = left - days * 86400000;
      out.phoenix = { days: days, clock: hms(rem), by19: days % 19 === 0, by138: days % 138 === 0 };
    } else out.phoenix = null;
    out.yearsTo = function (y) { return ((Date.UTC(y, 0, 1) - nowMs) / 3.15576e10).toFixed(1); };
    return out;
  }

  /* ------------------------------------------ resonance of a Z-Date -- */
  // Marks for a UTC day: palindromic MMDDYYYY, 19/138 day-distance from today.
  function resonance(dayMs, todayMs) {
    var d = new Date(dayMs), mm = pad2(d.getUTCMonth() + 1), dd = pad2(d.getUTCDate()), yy = String(d.getUTCFullYear());
    var digits = mm + dd + yy, dist = Math.round((dayMs - todayMs) / 86400000);
    return {
      palindrome: digits === digits.split("").reverse().join(""),
      by19: dist !== 0 && dist % 19 === 0,
      by138: dist !== 0 && dist % 138 === 0,
      distance: dist
    };
  }

  NC.chron = {
    mod: mod, isPal: isPal, nextPal: nextPal, fmtYear: fmtYear, astroFrom: astroFrom, jdn: jdn, noonMs: noonMs,
    cycles: cycles, LEDGER: LEDGER, ledgerMarks: ledgerMarks, BAKTUNS: BAKTUNS, calendars: calendars,
    flags: flags, clocks: clocks, resonance: resonance, PHOENIX_MS: PHOENIX_MS
  };
})(typeof window !== "undefined" ? window : globalThis);
