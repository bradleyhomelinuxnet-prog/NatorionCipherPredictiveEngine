/* NATORION · engine/formulas.js
   Two additions that sit beside the v12 engine and never change its results:

   1. MSRF TIERS — the hierarchy from the v2.0 data dump, as gathered in
      the community paper "Ophis MSRF Details: Sources for the MSRF Magnitude
      Calculator". Each MSRF number belongs to a Tier by how many "dimensions
      of arithmetic" (appearances across the six MSRF filters) it shows up in:
      Tier I = 2 … Tier VI = 7, Tier VII (Apex Projections) = 8 or more, split
      into ceta [lesser], beta and alpha [greater]. The dimension count is the
      magnitude. The numbers, filters and tier work are Jason Breshears'
      (Archaix); the magnitude reading is the paper author's.

   2. PHI SHADOW — divide a number by phi; the difference between the answer
      and the root is the "shadow", and it equals the answer divided by phi
      again. That holds for every number, because 1 - 1/phi = 1/phi^2 exactly:
         x - x/phi  =  x/phi^2
      e.g. 138 / 1.618 = 85.29 ; 138 - 85.29 = 52.71 ; 85.29 / 1.618 = 52.71
      With the rounded 1.618 the two routes differ in the third decimal; with
      the true phi they are identical. Both are offered.

   Data notes, kept as found (see natorion/FORMULAS.md):
   - 468 is listed twice in Tier I; it is counted once (Tier I: 280 unique of
     the stated 281).
   - 480 is listed in both Tier I and Tier III; the higher tier wins here.
   - 63 numbers in the v12 MSRF table have no tier yet (the vortex decimals,
     the paper's 61 "missing" numbers, plus 2558 and 2559). */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});

  var PHI = (1 + Math.sqrt(5)) / 2;      // 1.6180339887…
  var PHI_OPHIS = 1.618;                 // OPH_PHI, as v12 ships it

  var TIERS = [
    { key: "I",     name: "Tier I",            dims: 2, numbers: [
      27, 30, 33, 40, 45, 48, 51, 54, 69, 80, 81, 90, 96, 99, 102, 105, 116, 129, 135, 140, 150, 160, 196, 198,
      200, 207, 218, 222, 225, 232, 238, 253, 259, 273, 279, 294, 312, 320, 324, 343, 348, 350, 351, 354, 357,
      364, 365, 394, 400, 408, 423, 433, 440, 444, 450, 451, 465, 468, 480, 492, 501, 509, 513, 525, 528, 537,
      546, 549, 563, 570, 581, 591, 603, 627, 633, 640, 645, 657, 663, 670, 674, 677, 679, 680, 681, 698, 700,
      701, 708, 728, 730, 750, 759, 760, 791, 798, 800, 814, 825, 846, 858, 861, 867, 870, 873, 880, 885, 888,
      891, 897, 903, 910, 920, 936, 954, 957, 969, 1019, 1023, 1046, 1062, 1095, 1111, 1116, 1128, 1130, 1146,
      1160, 1163, 1170, 1173, 1182, 1184, 1190, 1197, 1215, 1218, 1221, 1230, 1240, 1254, 1275, 1280, 1287,
      1290, 1315, 1318, 1323, 1326, 1330, 1335, 1354, 1360, 1365, 1368, 1395, 1401, 1410, 1416, 1419, 1441,
      1452, 1460, 1461, 1479, 1480, 1486, 1513, 1540, 1551, 1557, 1559, 1577, 1580, 1581, 1590, 1600, 1610,
      1617, 1628, 1632, 1640, 1641, 1674, 1710, 1715, 1716, 1720, 1722, 1734, 1736, 1744, 1749, 1750, 1755,
      1760, 1773, 1776, 1782, 1786, 1794, 1815, 1820, 1825, 1827, 1830, 1840, 1854, 1861, 1863, 1880, 1881,
      1887, 1899, 1914, 1938, 1947, 1950, 1953, 1974, 1977, 1995, 1998, 2000, 2010, 2013, 2025, 2030, 2047,
      2052, 2058, 2088, 2091, 2093, 2103, 2120, 2124, 2130, 2133, 2145, 2151, 2191, 2193, 2200, 2210, 2226,
      2250, 2257, 2271, 2293, 2320, 2322, 2326, 2331, 2343, 2360, 2363, 2370, 2388, 2391, 2397, 2401, 2409,
      2412, 2415, 2421, 2440, 2447, 2450, 2457, 2475, 2480, 2490, 2499, 2502, 2508, 2511, 2532, 2541, 2555] },
    { key: "II",    name: "Tier II",           dims: 3, numbers: [
      8, 12, 13, 24, 34, 36, 55, 60, 70, 89, 98, 108, 114, 138, 165, 168, 180, 186, 204, 223, 226, 231, 233,
      234, 280, 286, 300, 301, 315, 336, 363, 372, 377, 390, 429, 434, 447, 453, 459, 462, 463, 476, 510, 520,
      526, 531, 534, 544, 552, 555, 558, 560, 561, 588, 610, 618, 675, 686, 714, 726, 732, 735, 765, 770, 777,
      810, 816, 831, 855, 900, 918, 952, 966, 972, 980, 987, 1000, 1035, 1040, 1089, 1092, 1096, 1104, 1120,
      1122, 1140, 1147, 1152, 1279, 1300, 1350, 1359, 1377, 1400, 1446, 1500, 1554, 1575, 1596, 1597, 1638,
      1650, 1701, 1738, 1740, 1770, 1785, 1806, 1826, 1872, 1904, 1944, 1960, 1989, 2031, 2079, 2080, 2112,
      2170, 2184, 2190, 2208, 2211, 2220, 2240, 2277, 2288, 2304, 2340, 2346, 2352, 2380, 2394, 2418, 2442,
      2460, 2483, 2550, 2556] },
    { key: "III",   name: "Tier III",          dims: 4, numbers: [
      42, 72, 120, 176, 189, 210, 240, 252, 255, 270, 276, 297, 396, 405, 441, 460, 480, 490, 495, 540, 576,
      594, 600, 621, 660, 669, 693, 702, 744, 774, 780, 792, 801, 819, 828, 868, 882, 924, 945, 960, 1020,
      1050, 1056, 1071, 1155, 1177, 1188, 1320, 1332, 1386, 1449, 1485, 1488, 1518, 1520, 1560, 1620, 1683,
      1764, 1836, 1848, 1860, 1920, 1932, 1980, 2046, 2178, 2205, 2244, 2280, 2292, 2295, 2430, 2436, 2478] },
    { key: "IV",    name: "Tier IV",           dims: 5, numbers: [
      21, 63, 66, 132, 144, 153, 264, 288, 306, 330, 378, 414, 432, 612, 648, 666, 672, 690, 1074, 1176, 1200,
      1302, 2040, 2070, 2142, 2232, 2484] },
    { key: "V",     name: "Tier V",            dims: 6, numbers: [
      84, 126, 216, 567, 630, 756, 864, 1380, 1470, 1728, 2268, 2376, 2400, 2448] },
    { key: "VI",    name: "Tier VI",           dims: 7, numbers: [
      360, 420, 720, 990, 1110, 1344, 1404, 1428, 1584, 1656, 1890, 2100, 2310] },
    { key: "VIIc",  name: "Tier VII ceta",     dims: 8, apex: "ceta [lesser]",  numbers: [930, 1080, 1134, 1440, 1800] },
    { key: "VIIb",  name: "Tier VII beta",     dims: 8, apex: "beta",           numbers: [840, 1242, 1296, 1680, 2160] },
    { key: "VIIa",  name: "Tier VII alpha",    dims: 8, apex: "alpha [greater]", numbers: [504, 1008, 1224, 1260, 1512, 2016, 2520] }
  ];

  // Rank: Tier I = 1 … Tier VII alpha = 9. Later (higher) tiers overwrite, so
  // 480 resolves to Tier III.
  var INDEX = new Map();
  TIERS.forEach(function (t, i) {
    t.rank = i + 1;
    t.numbers.forEach(function (n) { INDEX.set(n, t); });
  });

  /* tierOf(n) — the tier record for an exact MSRF number, or null. */
  function tierOf(n) { return INDEX.get(Number(n)) || null; }

  /* magnitude(z) — everything known about a Z-value: the v12 app class it
     matches (Normal / Important / Vortex, via the engine's own msrfMatch),
     and the tier and dimension count of the matched number. When the engine
     finds no match (including its rule that a value ending in exactly .5 is
     no match), the nearest whole number's tier is still given, marked
     exact: false. */
  function magnitude(z) {
    var m = NC.msrfMatch ? NC.msrfMatch(z) : null;
    var n = m ? m.number : Math.round(z);
    var t = tierOf(n);
    return {
      z: z,
      exact: !!m,
      number: m ? m.number : (t ? n : null),
      appClass: m ? m.cls.name : null,
      tier: t ? t.name : null,
      tierKey: t ? t.key : null,
      rank: t ? t.rank : 0,
      dims: t ? t.dims : 0,
      apex: t && t.apex ? t.apex : null
    };
  }

  /* phiShadow(x, phi) — x/phi, the shadow x - x/phi, and x/phi/phi (which
     equals the shadow exactly when phi is the true golden ratio). */
  function phiShadow(x, phi) {
    phi = phi || PHI;
    var a = x / phi;
    return { root: x, phi: phi, answer: a, shadow: x - a, shadowByPhi: a / phi };
  }

  /* phiLadder(x, steps, phi) — x, x/phi, x/phi^2 … each rung is the shadow of
     the rung two above it. Each rung is checked against the MSRF table. */
  function phiLadder(x, steps, phi) {
    phi = phi || PHI;
    var out = [], v = x;
    for (var i = 0; i <= (steps || 6); i++) {
      out.push({ step: i, value: v, msrf: magnitude(v) });
      v = v / phi;
    }
    return out;
  }

  NC.formulas = {
    PHI: PHI, PHI_OPHIS: PHI_OPHIS,
    MSRF_TIERS: TIERS,
    tierOf: tierOf, magnitude: magnitude,
    phiShadow: phiShadow, phiLadder: phiLadder,
    // Equations for the Operations screen (the grammar's x/÷ and OPH_PHI):
    SHADOW_EQUATIONS: ["X1+Y/OPH_PHI/OPH_PHI", "X2+Y/OPH_PHI/OPH_PHI", "X1+Y-Y/OPH_PHI"]
  };
})(typeof window !== "undefined" ? window : globalThis);
