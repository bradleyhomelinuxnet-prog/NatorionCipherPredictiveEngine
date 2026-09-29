/* NATORION · studio/studio.js
   The Studio: a production package for an animated history documentary,
   written from the numbers of the open event and the Chronicon — a numbered
   voiceover script, character look cards, one image prompt for every
   paragraph, one animation prompt for every image, a thumbnail and the
   upload text. Pure functions, no DOM. The same event, results and options
   give the same package every time; nothing is fetched, and nothing from a
   document is run as code or written as HTML.

   The brief it follows (the channel's master production prompt): 160–175
   words a minute, paragraphs of 15–40 words numbered §1, §2 …, a hook in
   the first three, a braided structure with return pulls, at least three
   etymology drops and three "still exists today" anchors, the closing call
   to subscribe; one image per paragraph in the painterly Klaus-like style
   with its mandatory tag, shot types never repeated twice running, motion-
   only animation prompts, a thumbnail and the SEO package. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, T = NC.time, CH = NC.chron;
  var DAY = C.MS_DAY;

  /* ------------------------------------------------------------- fixed -- */
  var WPM = 167;   // the middle of the brief's 160–175 words a minute
  var LENGTHS = {
    5:  { seconds: 300, words: [800, 875],   paragraphs: [35, 40],  ladder: 10, shares: { hook: 80,  origins: 200, escalation: 300,  climax: 200, legacy: 75 } },
    10: { seconds: 600, words: [1600, 1750], paragraphs: [65, 80],  ladder: 24, shares: { hook: 150, origins: 400, escalation: 700,  climax: 400, legacy: 150 } },
    15: { seconds: 900, words: [2400, 2625], paragraphs: [95, 120], ladder: 60, shares: { hook: 200, origins: 600, escalation: 1050, climax: 550, legacy: 200 } }
  };
  var SECTIONS = [["hook", "The hook"], ["origins", "Origins and context"], ["escalation", "Escalation"], ["climax", "Climax and resolution"], ["legacy", "Legacy and ending"]];
  var STYLE_TAG = "Cinematic painterly art-house 3D animation frame, European animated feature film quality, semi-stylized character proportions with oversized prominent rosy-tipped noses and large dark-dot eyes with white catchlights, matte hand-painted brush-stroke textures on all surfaces, rich warm natural color palette, strong directional atmospheric lighting with volumetric haze, depth layers with atmospheric perspective, 16:9 horizontal. NOT Pixar, NOT Disney, NOT DreamWorks, NOT clean CGI, NOT cute, NOT chibi, NOT storybook illustration, NOT flat 2D, NOT anime.";
  var CLIP_SUFFIX = "Maintain painterly matte textured art-house animation quality throughout. Smooth natural character movement. Deep atmospheric lighting. NO style shift to clean CGI. NO morphing. NO Pixar/Disney look.";
  var CTA = "Subscribe for more stories from history brought to life.";
  var BANNED_NARRATION = ["in conclusion", "it is worth noting", "furthermore", "let's dive in", "without further ado", "interestingly enough", "it's important to note", "it's worth mentioning"];
  // Words the brief bans from image and video prompts. The mandatory tag and
  // the clip suffix name some of them to forbid them; lint() strips those first.
  var BANNED_VISUAL = ["pixar", "disney", "dreamworks", "cute", "adorable", "whimsical", "charming", "chibi", "dwarf", "hobbit", "miniature", "storybook", "fairy tale", "children's illustration", "cartoon", "realistic", "photorealistic", "hyper-realistic", "caricature", "neon", "garish", "glossy", "porcelain", "plastic", "anime", "manga", "video game", "video-game", "stock photo"];

  var SHOTS = {
    "EXTREME WIDE": "the figure small in a vast environment, foreground, midground and background fading into atmospheric haze",
    "WIDE": "the full scene, the characters and the architecture behind them in one frame",
    "MEDIUM": "waist-up, the character's hands and face both readable",
    "CLOSE-UP": "the face filling the frame, the oversized nose in three-quarter profile, the emotion unmistakable",
    "EXTREME CLOSE-UP": "hands, the page and the tools filling the frame, every brush stroke visible",
    "LOW ANGLE": "looking up from the ground, the figure or the monument towering over the viewer",
    "HIGH ANGLE / BIRD'S EYE": "looking straight down over the table, the map and the room",
    "OVER-SHOULDER": "from behind the character's shoulder, looking at what they see",
    "FOREGROUND-FRAMED": "the scene seen through an archway or doorframe, the frame itself in deep shadow",
    "MAP VIEW": "a painted map seen from above, a drawn line of dates with small stone markers along it",
    "SPLIT SCREEN": "two moments side by side with a painted seam between them",
    "TEXT CARD": "aged parchment filling the frame, the words in a worn serif, candlelight raking across the grain"
  };
  var ROTATION = ["WIDE", "MEDIUM", "CLOSE-UP", "LOW ANGLE", "OVER-SHOULDER", "EXTREME WIDE", "HIGH ANGLE / BIRD'S EYE", "FOREGROUND-FRAMED"];
  var CAMERA_MOVES = ["slow push-in", "slow pan left to right", "lateral tracking shot, right to left", "gentle tilt up", "slow dolly forward", "slow pull-back", "gentle tilt down", "slow pan right to left"];

  /* Three palettes by era, each with the settings the scenes are staged in. */
  var ERAS = {
    ancient: {
      name: "Ancient / Mediterranean", palette: "sun-drenched terracotta, warm sand and golden ochre, with one azure accent",
      desk: "a low cedar table", lamp: "a bronze oil lamp", mirror: "a polished bronze mirror", counting: "a knotted cord and clay tallies",
      settings: {
        study: { desc: "a mud-brick scribe's chamber on the Giza plateau: a low cedar table heaped with papyrus rolls, clay tally jars, a bronze oil lamp, a reed pen case, a narrow window slit onto the plateau", details: "spilled grain on the floor, a stack of clay tablets, a reed mat, a water jar sweating in the corner, dust turning in the lamplight", time: "night", motion: "lamp flame leaning and steadying, dust drifting through the light, a papyrus edge lifting in a draught" },
        exterior: { desc: "the Giza plateau: the Great Pyramid's limestone flank rising into haze, worn causeway stones, workers' ramps of rubble, the Nile flood-plain green in the distance", details: "coils of rope, a wooden sledge, water skins, a donkey under a load, footprints in the dust, hanging linen shading a doorway", time: "day", motion: "heat haze shimmering over the stone, dust lifting off the causeway, the linen shade swaying" },
        observatory: { desc: "a flat temple roof under a vast desert sky: a sighting stone, a dripping water clock, a low parapet, the Milky Way as a painted smear over the plateau", details: "a wax tablet weighted with a stone, an oil lamp shielded by a clay shard, a folded cloak, sand blown into the corners", time: "night", motion: "the water clock dripping, the lamp flame trembling behind its shard, thin cloud crossing the moon" },
        market: { desc: "a riverside market under reed awnings: heaps of grain, weighed copper on a balance, baskets of dates and fish, donkeys, dust, mud-brick walls behind", details: "a scribe's stall with tally sticks, fish drying on a line, a child chasing a goose, broken pottery underfoot", time: "day", motion: "the crowd shifting, awnings breathing in the wind, dust rising around the donkeys' feet" },
        wall: { desc: "a painted temple corridor: nineteen calendar tables carved and painted in rows on the plastered wall, an oil lamp on a bracket, glyphs worn smooth by hands", details: "a basket of dried lotus, a mason's chisel left on a ledge, soot above the lamp, a swept floor with one sandal print", time: "night", motion: "lamplight sliding across the painted tables, smoke curling from the wick, a moth circling the flame" },
        map: { desc: "a shaded courtyard table: a papyrus map of the river and the coast, small limestone markers along a line of dates, a plumb line, a bronze rule", details: "a bowl of figs, a cat asleep on a scroll, a jar of ink, shade cloth moving overhead", time: "day", motion: "shade cloth rippling and dappling the map, the plumb line swinging to rest, the cat's ear twitching" },
        stone: { desc: "the Great Pyramid at dawn: mist on the plateau, the first light striking the flank, the casing stones pale and weathered, the Sphinx a shape in the haze", details: "a lone sledge track, a cold fire pit, a stack of copper tools, a linen shade flapping", time: "dawn", motion: "mist thinning and drifting across the plateau, light creeping down the flank, the linen shade flapping" },
        ruin: { desc: "a river city under a blood-red sky: ash falling, a cracked temple wall, people fleeing along the quay with bundles, boats capsized in the shallows", details: "an overturned grain basket, a dog pulling at a rope, a fallen statue's head, smoke over the reed roofs", time: "red", motion: "ash falling steadily, the crowd surging along the quay, smoke rolling low over the roofs, the sky pulsing dull red" }
      },
      wardrobe: {
        anchor: "a charcoal-grey linen tunic to the knee with a faded red woven sash, a bronze cuff at the wrist and worn leather sandals", anchorFabric: "the linen creased and dusty with true weight in its folds",
        surveyor: "a sun-bleached white linen kilt, a wide leather belt hung with a knotted measuring cord and a bronze plumb bob, a dusty ochre shoulder cloth", surveyorFabric: "the linen stiff with sweat and dust, the leather cracked",
        astronomer: "an ankle-length robe of dusty olive linen with a fringed hem, a leather cord carrying a bone sighting tube, a wax tablet at the hip", astronomerFabric: "the linen thin and much-washed, hanging in long soft folds",
        watchman: "a short kilt of undyed linen, a goatskin cloak over one shoulder, a ram's-horn trumpet on a strap", watchmanFabric: "the goatskin matted and the linen frayed at the hem",
        crowd: "undyed linen kilts and shifts, terracotta-red shawls, faded blue head cloths and worn leather sandals", crowdItems: "reed baskets, clay jars and bundles of dried fish"
      }
    },
    medieval: {
      name: "Medieval European", palette: "cool blue-grey stone and dark timber with muted reds and blues, and one warm amber accent from fire or window",
      desk: "a slanted oak desk", lamp: "a tallow candle", mirror: "a polished steel mirror", counting: "a tally stick and a knotted cord",
      settings: {
        study: { desc: "a stone scriptorium cell: a slanted oak desk under a horn window, gall-ink pots, a chained ledger, drying herbs in the rafters, a tallow candle on an iron spike", details: "a mouse-nibbled loaf, a knife for scraping vellum, sand for blotting, wax drips down the candle, a wet cloak steaming on a peg", time: "night", motion: "the candle flame dancing and guttering, steam rising off the cloak, a herb bundle turning slowly in the rafters" },
        exterior: { desc: "a cathedral building site: scaffold timbers lashed with rope, a treadwheel crane, stacked dressed stone, mud and puddles, a half-raised tower against a pale sky", details: "a mason's lodge with tools on the wall, a lime pit, a cart of rubble, chickens in the mud, a bell hanging in a wooden frame", time: "overcast", motion: "the treadwheel turning, a stone swaying on its rope, chickens scattering, a thin drizzle starting" },
        observatory: { desc: "a tower top under a cold sky: a wooden quadrant, a brazier of embers, wet crenellations, fog filling the valley below, the moon over a black ridge", details: "a pair of dividers on a plank, a parchment chart weighted with stones, a jug of ale, a raven on the parapet", time: "night", motion: "embers brightening in a gust, fog creeping over the crenellations, the raven shifting its weight, the chart's corner lifting" },
        market: { desc: "a muddy market square: timber-framed houses leaning together, hanging laundry, a stone well, baskets of turnips and eels, a scribe's stall under an awning", details: "a pig rooting under a stall, a friar counting coins, a cart wheel sunk in mud, geese, a pillory with nobody in it", time: "overcast", motion: "laundry swaying on its line, the crowd shifting, geese flapping across the foreground, smoke rising from a brazier" },
        wall: { desc: "a chapter-house wall painted with nineteen calendar tables in red and black, a lamp on an iron bracket, worn flagstones, a bench with a psalter lying open", details: "a broom, a heap of rushes, a dog asleep by the door, candle smoke stains, a scratched tally on the plaster", time: "night", motion: "lamplight wavering across the painted tables, smoke curling to the vault, the dog's flank rising and falling" },
        map: { desc: "a long trestle table in a hall: a vellum map of the coasts, pebble markers along a charcoal line of dates, a knotted cord, an hourglass running", details: "a heel of bread, a hound under the table, a spilled inkhorn, tapestry shadows, a fire in the hearth", time: "night", motion: "sand running in the hourglass, firelight flickering over the vellum, the hound stretching, tapestry edges stirring" },
        stone: { desc: "the Great Pyramid at dawn seen from a pilgrims' camp: mist on the plateau, first light on the flank, camels kneeling, a monk sketching on a wax tablet", details: "a cold campfire, tent ropes, a water skin, a rosary hung on a spear", time: "dawn", motion: "mist drifting and thinning, light creeping down the flank, a camel lifting its head, the tent cloth stirring" },
        ruin: { desc: "a walled town under a blood-red sky: ash falling on slate roofs, a cracked church tower, townspeople fleeing the gate with bundles, a cart overturned", details: "a bell fallen in the street, geese scattering, a dropped ledger in the mud, smoke pouring from a thatch", time: "red", motion: "ash falling steadily, the crowd pressing through the gate, smoke rolling from the thatch, the sky pulsing dull red" }
      },
      wardrobe: {
        anchor: "a charcoal-grey wool hooded tunic belted with worn leather, faded red hose, a scribe's leather satchel and soft leather shoes", anchorFabric: "the wool heavy and creased with true weight in its folds",
        surveyor: "a dark green wool cotehardie, a leather apron over it, a knotted cord and iron dividers hung from the belt, mud-caked boots", surveyorFabric: "the wool worn shiny at the elbows, the apron scarred and stained",
        astronomer: "a long dun-brown wool robe with a fur-trimmed collar, a brass astrolabe on a cord, a felt cap", astronomerFabric: "the wool thin at the cuffs, the fur rubbed bare in patches",
        watchman: "a padded gambeson of faded brown, a grey wool hood, a brass bell on a cord, boots wrapped in rags", watchmanFabric: "the gambeson quilted and stained, the hood patched",
        crowd: "faded red wool dresses, brown wool tunics, off-white linen coifs, dark green cloaks and worn leather shoes", crowdItems: "baskets, bundles and market goods"
      }
    },
    golden: {
      name: "Golden Age / Renaissance", palette: "dark warm brown and deep blue with forest green and burgundy, and one candlelit amber accent",
      desk: "a cluttered oak table", lamp: "a candle in a brass stick", mirror: "a small glass mirror in a black frame", counting: "an abacus and a rule",
      settings: {
        study: { desc: "a timber-beamed study: a cluttered oak table under a brass astrolabe, stacked ledgers, a wax-sealed letter, a wall clock stopped at 1:38, rain on leaded glass", details: "a globe with a cracked ocean, a candle guttering in a brass stick, quills in a jar, a cat on the ledgers, a half-eaten pear", time: "night", motion: "the candle flame dancing, rain streaking the leaded glass, the cat's tail curling, the astrolabe turning a degree on its cord" },
        exterior: { desc: "a walled city's quay at first light: stacked barrels, coiled rope, gulls, merchant houses with stepped gables, masts fading into harbour haze", details: "a crate of oranges split open, a boy with a barrow, fish scales glittering on the stones, a customs table with a ledger", time: "dawn", motion: "gulls wheeling, masts swaying in the haze, the barrow rolling past, mist lifting off the water" },
        observatory: { desc: "a rooftop observatory: a brass sextant on a tripod, charts weighted with stones, a lantern's light, the city's chimneys and a church spire below, the moon over the roofs", details: "a telescope case, a pipe left smoking, a wine cup, pigeons roosting on the gable", time: "night", motion: "pipe smoke rising and thinning, the lantern flame steadying, pigeons shifting on the gable, cloud crossing the moon" },
        market: { desc: "a stone market hall: bolts of cloth, a moneychanger's table with scales, hanging hams, stacked barrels, pigeons in the rafters, light through high windows", details: "a spilled sack of pepper, a lapdog on a cushion, a ledger open on a barrel, a broken crate, a beggar's bowl", time: "day", motion: "the crowd shifting, pigeons dropping from the rafters, the scales swinging to rest, dust turning in the window light" },
        wall: { desc: "a merchant's counting-room wall hung with nineteen painted calendar boards, a brass lamp, an iron strongbox, ledgers tied with ribbon", details: "a spilled purse of coins, an abacus, a wax seal and its stick, dust on the beams, a stopped clock", time: "night", motion: "lamplight wavering across the boards, a coin rolling to a stop, dust drifting from the beams" },
        map: { desc: "a map room: a painted chart of the known world under a brass lamp, small lead markers along an ink line of dates, dividers, a rule, a half-rolled scroll", details: "a glass of wine, sand for blotting, a compass rose worn pale by fingers, a sleeping hound, a cracked window pane", time: "night", motion: "the scroll's edge lifting and settling, lamplight sliding across the chart, the hound's ear twitching, rain ticking at the cracked pane" },
        stone: { desc: "the Great Pyramid at dawn from a surveyor's camp: mist on the plateau, first light on the flank, a theodolite on a tripod, a tent, a folding table of instruments", details: "a kettle on a spirit stove, a notebook weighted open, a camel's shadow, chains and rods laid out in the sand", time: "dawn", motion: "steam rising from the kettle, mist thinning across the plateau, light creeping down the flank, the tent cloth stirring" },
        ruin: { desc: "a harbour city under a blood-red sky: ash falling on tiled roofs, a cracked bell tower, people fleeing along the quay with bundles, ships dragging their anchors in the swell", details: "a cart of oranges overturned, a dog barking at the sky, a dropped ledger in a puddle, smoke over the warehouses", time: "red", motion: "ash falling steadily, ships heaving in the swell, the crowd surging along the quay, smoke rolling over the roofs" }
      },
      wardrobe: {
        anchor: "a charcoal-grey wool doublet with one faded burgundy sleeve, a white linen collar gone to cream, a leather-bound ledger at the belt", anchorFabric: "the wool heavy and creased with true weight in its folds",
        surveyor: "a deep blue wool coat with brass buttons, a leather case of dividers and a rule at the belt, a wide-brimmed felt hat, dusty riding boots", surveyorFabric: "the wool rubbed pale at the seams, the boots scuffed",
        astronomer: "a long forest-green velvet gown worn to a shine, a brass quadrant on a cord, a black skullcap", astronomerFabric: "the velvet bald at the elbows and hem",
        watchman: "a russet leather jerkin over a linen shirt, a grey wool cloak, a lantern on a pole", watchmanFabric: "the leather cracked, the cloak patched at the shoulder",
        crowd: "dark brown and deep blue wool coats, aged-white linen collars, felt hats and worn leather shoes", crowdItems: "market baskets, ledgers and stacked barrels"
      }
    }
  };
  var ERA_KEYS = ["ancient", "medieval", "golden"];

  /* ------------------------------------------------------------ helpers -- */
  function words(text) { return String(text || "").split(/\s+/).filter(function (t) { return /[A-Za-z0-9]/.test(t); }).length; }
  function fits(text) { var n = words(text); return n >= 15 && n <= 40; }
  function num(n) { return Number(n).toLocaleString("en-US"); }
  function plural(n, one, many) { return n === 1 ? one : (many || one + "s"); }
  function clampWords(text, max) { var t = String(text || "").trim().split(/\s+/); return t.length <= max ? t.join(" ") : t.slice(0, max).join(" "); }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  var SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  function wordNum(n) { return n >= 0 && n < 10 ? SMALL[n] : num(n); }
  function times(n) { return n === 2 ? "twice" : n === 3 ? "three times" : n + " times"; }
  // "the moon is a new moon", "at first quarter", "waxing gibbous"
  function moonPhrase(name) { return /^(new|full) moon$/.test(name) ? "a " + name : /quarter$/.test(name) ? "at " + name : name; }
  // An MSRF match, spoken: "647.7 rounds to 648, a normal number on the list" or "552 sits on the list as a normal number".
  function hitLine(m) {
    var z = num(m.r.z), k = num(m.number), cls = m.cls.name.toLowerCase();
    return z === k ? z + " sits on the list as " + (cls === "important" ? "an" : "a") + " " + cls + " number" : z + " rounds to " + k + ", " + (cls === "important" ? "an" : "a") + " " + cls + " number on the list";
  }
  // The formulas that land on a day, each named once: "formula 8 twice, formula 1 and formula 12".
  function formulaNames(ops) {
    var counts = [], seen = {};
    ops.forEach(function (x) { var i = x.r.opIndex; if (seen[i] == null) { seen[i] = counts.length; counts.push({ i: i, n: 0 }); } counts[seen[i]].n++; });
    var list = counts.map(function (c) { return "formula " + (c.i + 1) + (c.n > 1 ? " " + times(c.n) : ""); });
    if (list.length > 3) return list.slice(0, 3).join(", ") + " and more";
    return list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : list[0];
  }
  function hashText(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // mulberry32: small, seeded, the same sequence everywhere.
  function rng(seed) {
    var a = seed >>> 0;
    var next = function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { next: next, int: function (n) { return Math.floor(next() * n); } };
  }
  var WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function longDate(w) { return w.d + " " + MO[w.m - 1] + " " + w.y; }
  function weekdayOf(w) { return WD[new Date(T.utcMs(w.y, w.m, w.d)).getUTCDay()]; }
  function digitsOf(w) { return T.pad(w.m) + T.pad(w.d) + w.y; }
  function noonOf(w) { return T.utcMs(w.y, w.m, w.d, 12, 0); }
  function dayOf(ms, zone) { var w = T.wall(ms, zone); return T.utcMs(w.y, w.m, w.d); }

  /* Days as a modern comparison, for scale. */
  function compareDays(n) {
    n = Math.abs(Math.round(n));
    if (n < 2) return "one turn of the sky";
    if (n < 8) return "a working week, near enough";
    if (n < 15) return "a fortnight, one decent holiday";
    if (n < 32) return "about a month, one rent day to the next";
    if (n < 70) return "two months, a long summer";
    if (n < 100) return "a school term";
    if (n < 190) return "half a year, the gap between a resolution and its funeral";
    if (n < 300) return "most of a year, a football season and change";
    if (n < 400) return "one lap of the sun, give or take";
    if (n < 800) return "two years, the life of a phone contract";
    if (n < 1200) return "three years, a degree if you hurry";
    if (n < 1500) return "four years, one World Cup to the next";
    if (n < 2000) return "five years, the length of a long lease";
    if (n < 2600) return "seven years, the fabled itch";
    if (n < 3700) return "nearly a decade";
    return Math.round(n / 365.25) + " years, longer than most attention spans";
  }

  /* An operation's body, in words. */
  var KNOWN = {
    "oph_round(Y)": "Y itself", "oph_flip(oph_round(Y))": "Y with its digits reversed", "Y/OPH_CRV": "Y divided by 5.08",
    "(Y/2.0)xOPH_PI": "half of Y times pi", "Y/OPH_PHI": "Y divided by phi", "(Y/2.0)xOPH_PHI": "half of Y times phi",
    "(Y/2.0)xOPH_CRV": "half of Y times 5.08", "YxOPH_PHI": "Y times phi", "YxOPH_PI": "Y times pi",
    "YxOPH_CRV": "Y times 5.08", "YxOPH_HEP": "Y times 7.01"
  };
  // Constant names read aloud, longest first, so no name is eaten by a shorter one it contains.
  var SPOKEN_CONSTANTS = C.CONSTANTS.slice().sort(function (a, b) { return b.name.length - a.name.length; });
  function describeEquation(equation) {
    var body = String(equation || "").replace(/\s+/g, "").replace(/^X[12]\+/, "");
    if (KNOWN[body]) return KNOWN[body];
    var s = body.replace(/oph_([a-z]+)/g, function (_, n) { return "§" + n + "§"; });
    s = s.replace(/\(Y\/2\.0\)/g, "half of Y");
    s = s.replace(/[x*]/g, " times ").replace(/\//g, " over ").replace(/\^/g, " to the power ").replace(/%/g, " modulo ").replace(/\+/g, " plus ").replace(/-/g, " minus ");
    SPOKEN_CONSTANTS.forEach(function (c) { s = s.split(c.name).join(c.spoken); });
    s = s.replace(/§([a-z]+)§/g, function (_, n) { return n === "flip" ? "the reverse of " : n === "round" ? "the rounding of " : n === "sqrt" ? "the square root of " : n + " of "; });
    return s.replace(/\(\s*/g, "(").replace(/\s*\)/g, ")").replace(/\(Y\)/g, "Y").replace(/\s+/g, " ").trim();
  }

  /* A ledger entry as one spoken clause, cut at its first dash or semicolon. */
  function ledgerClause(entry) {
    var t = String(entry[2]).split(/ — |; /)[0].replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
    return clampWords(t, 14);
  }

  /* --------------------------------------------------------------- cast -- */
  function card(p) {
    return "A semi-stylized animated character with " + p.build + " proportions and a slightly oversized head. Dramatically oversized " + p.nose + " nose tinted rosy pink at the tip and bridge, protruding far from the face. " +
      "Large round solid-black dot eyes with tiny white catchlight dots, no colored iris detail. " + cap(p.skin) + " skin with matte rough painterly brush-stroke texture, rosy pink tint on nose tip and cheeks. " +
      p.face + ". " + p.hair + ". " + (p.beard ? p.beard + ". " : "") + "Wearing " + p.clothing + ", " + p.fabric + ", " + p.accessories + ". " + p.unique + ".";
  }
  function buildCast(era, anchorName, flags) {
    var W = era.wardrobe, list = [];
    list.push({ key: "anchor", name: anchorName.toUpperCase() + " — THE CHRONICLER", short: anchorName, card: card({
      build: "tall lean", nose: "long drooping", skin: "warm olive", face: "Long face with high cheekbones and a narrow chin",
      hair: "Thick auburn hair pulled back and rendered in chunky simplified painted masses, two painted strands loose at the temple", beard: "",
      clothing: W.anchor, fabric: W.anchorFabric, accessories: "a reed pen or quill behind one ear and a leather ledger chained to the belt",
      unique: "Three small gold glyph marks painted at the throat, ink stains on the right thumb, and a habit of tilting the head when a number does not add up"
    }) });
    list.push({ key: "surveyor", name: "THE SURVEYOR", short: "the Surveyor", card: card({
      build: "stocky broad-shouldered", nose: "large round bulbous", skin: "sun-browned ruddy", face: "Square face with a heavy jaw and a permanently raised left eyebrow",
      hair: "Cropped grey-shot black hair in blocky painted masses", beard: "Thick blocky russet beard as a textured mass, squared off at the bottom",
      clothing: W.surveyor, fabric: W.surveyorFabric, accessories: "a plumb line looped over one shoulder",
      unique: "A pale scar across the bridge of the nose and hands like shovels with rosy pink knuckles"
    }) });
    list.push({ key: "astronomer", name: "THE ASTRONOMER", short: "the Astronomer", card: card({
      build: "medium, slightly stooped", nose: "gently pointed but thick", skin: "pale weathered", face: "Narrow face with deep creases, hooded eyes and hollow cheeks",
      hair: "Long white hair in thin painted masses falling past the collar", beard: "Long thin white beard rendered as a single tapering mass",
      clothing: W.astronomer, fabric: W.astronomerFabric, accessories: "a wax tablet and a stylus on a cord",
      unique: "A missing front tooth that shows when the mouth opens, and a stoop that straightens only when looking up"
    }) });
    if (flags.watchman) list.push({ key: "watchman", name: "THE WATCHMAN AT SUNSET", short: "the Watchman", card: card({
      build: "medium and wiry", nose: "wide fleshy", skin: "wind-burned brown", face: "Round weathered face with stubble shadow and squinting eyes",
      hair: "Short sandy hair in rough painted tufts", beard: "",
      clothing: W.watchman, fabric: W.watchmanFabric, accessories: "a tally stick notched for every sunset",
      unique: "A hunched posture, always turned a little to the west, and one ear larger than the other"
    }) });
    list.push({ key: "crowd", name: "THE LEDGER CROWD", short: "the crowd", group: true, card:
      "A group of semi-stylized animated characters with slightly oversized heads, each with a uniquely shaped oversized prominent nose (one round and bulbous, one long and drooping, one wide and flat, one gently pointed), all with rosy pink nose tips. Large dark-dot eyes with white catchlights. Varied builds — one tall and lean, one short and round, one medium. Wearing " + W.crowd + ". Carrying " + W.crowdItems + "." });
    return list;
  }

  /* ------------------------------------------------------------- digest -- */
  function safeMoon(ms) {
    try { var m = NC.sky.moonState(ms); return { name: NC.sky.phaseForAngle(m.angle).name.toLowerCase(), age: m.age, lit: Math.round(m.illum * 100) }; }
    catch (e) { return null; }
  }
  function nearSky(dayMs) {
    var out = { moon: null, eclipse: null };
    try {
      var ph = NC.sky.moonPhasesNear([dayMs], [NC.sky.PHASES[0], NC.sky.PHASES[4]]);
      if (ph.length) out.moon = ph[0].phase.key === "new" ? "new moon" : "full moon";
    } catch (e) { /* out of range */ }
    try {
      var ec = NC.sky.eclipsesNear([dayMs], { solarTotal: true, solarPartial: true, lunarTotal: true, lunarPartial: true });
      if (ec.length) out.eclipse = (ec[0].total ? "total " : "partial ") + ec[0].body + " eclipse";
    } catch (e) { /* none */ }
    return out;
  }
  function calOf(w) {
    var out = {};
    try { CH.calendars(w.y, w.m, w.d).forEach(function (c) { out[c.name] = c; }); } catch (e) { /* none */ }
    return out;
  }
  function spoken(cal, name) { var c = cal[name]; return c ? String(c.big).replace(/ · /g, ", ").replace(/\s+/g, " ").trim() : ""; }
  function spokenMeta(cal, name) { var c = cal[name]; return c ? String(c.meta).replace(/ · /g, ", ").replace(/✦ /g, "").replace(/\s+/g, " ").trim() : ""; }
  var READINGS = ["Maya", "Julian", "Persian", "Ethiopic", "Chinese sexagenary", "Byzantine", "Kali Yuga", "Holocene", "French Republican", "Anunna turnings", "Egyptian civil", "Indian national", "Buddhist", "Unix"];
  function placeName(event) {
    var lat = Number(event.lat), lon = Number(event.long), best = null, bd = 0.75;
    (NC.PLACES || []).forEach(function (p) { var d = Math.abs(p[1] - lat) + Math.abs(p[2] - lon); if (d < bd) { bd = d; best = p[0]; } });
    return best || ("latitude " + lat + ", longitude " + lon);
  }

  function digest(event, res, spec) {
    var zone = res.zone, hh = event.scope === C.SCOPE.HH_MM;
    var todayDay = NC.engine.cutoffFor({ scope: C.SCOPE.DAYS }, res.nowMs);
    var xs = [];
    (event.x_dates || []).forEach(function (x, i) {
      if (!x || x.enabled !== true) return;
      var ms = T.inputDateToMs(event, x); if (ms === null) return;
      var w = T.wall(ms, zone);
      xs.push({ i: i, label: "X" + (i + 1), ms: ms, w: w, cal: calOf(w), moon: safeMoon(noonOf(w)), cyc: CH.cycles(w.y) });
    });
    var ys = res.ys.map(function (y) { return { Y: y.Y, x1: y.x1, x2: y.x2, flip: NC.FUNCS.oph_flip(Math.round(y.Y)) }; });
    var ops = res.ops.filter(function (op) { return op.enabled && op.fn; });
    var pool = res.byDate.length ? res.byDate : NC.engine.sortZ(res.zs, C.SORT.DATE, res.system);
    var usedHidden = !res.byDate.length && res.zs.length > 0;
    function zInfo(t) {
      var dm = dayOf(t.start, zone), w = T.wall(dm, "UTC");
      return { t: t, ms: dm, w: w, score: t.score, hits: t.hits, msrf: t.msrf, rz: CH.resonance(dm, todayDay), out: res.last != null ? Math.round((t.start - res.last) / DAY) : null };
    }
    var ranked = NC.engine.sortZ(pool, C.SORT.SCORE, res.system).map(zInfo);
    var star = ranked[0] || null;
    if (star) { star.sky = nearSky(star.ms); star.cal = calOf(star.w); star.moon = safeMoon(noonOf(star.w)); star.cyc = CH.cycles(star.w.y); }
    var ladder = ranked.slice(1, 1 + spec.ladder).reverse();   // weakest first, so the stakes rise
    ladder.forEach(function (z) { z.sky = nearSky(z.ms); });
    var reserveZ = ranked.slice(1 + spec.ladder, 1 + spec.ladder + 40).reverse();
    var firstYear = xs.length ? xs[0].w.y : new Date(res.nowMs).getUTCFullYear();
    var before = CH.LEDGER.filter(function (e) { return e[0] < firstYear; }).slice(-2);
    var after = CH.LEDGER.filter(function (e) { return e[0] >= (star ? star.w.y : firstYear); }).slice(0, 4);
    var used = before.concat(after);
    var others = CH.LEDGER.filter(function (e) { return used.indexOf(e) < 0; }).sort(function (a, b) { return Math.abs(a[0] - firstYear) - Math.abs(b[0] - firstYear); });
    var tDates = (event.t_dates || []).filter(function (t) { return t && t.enabled === true; }).map(function (t) {
      var ms = T.inputDateToMs(event, t);
      return ms === null ? null : { ms: ms, w: T.wall(ms, zone), hit: pool.some(function (z) { return hh ? (ms >= z.start && ms < z.end) : z.start === ms; }) };
    }).filter(Boolean);
    var flipOp = ops.find(function (op) { return /oph_flip/.test(op.equation); }) || null;
    return {
      zone: zone, hh: hh, place: hh ? placeName(event) : null, todayW: T.wall(todayDay, "UTC"),
      xs: xs, ys: ys, ops: ops, pairs: ys.length, usedHidden: usedHidden, star: star, ladder: ladder, reserveZ: reserveZ,
      before: before, after: after, others: others, tDates: tDates, flipOp: flipOp, clocks: CH.clocks(res.nowMs),
      firstYear: firstYear, first: xs[0] || null, last: xs[xs.length - 1] || null, span: xs.length > 1 ? Math.round((xs[xs.length - 1].ms - xs[0].ms) / DAY) : 0
    };
  }

  /* ----------------------------------------------------------- the script --
     Every beat is one paragraph: its text, its kind (for the checks), and the
     scene it is drawn in. A section is filled from an ordered list of
     candidates: the mandatory ones always go in, the others while they fit
     what the section's budget leaves. */
  var SLACK = 12;
  function Section(key, name, budget) { this.key = key; this.name = name; this.budget = budget; this.beats = []; this.words = 0; }
  Section.prototype.add = function (b) { this.beats.push(b); this.words += b.words; };
  Section.prototype.fill = function (list) {
    var S = this, room = S.budget + SLACK - list.reduce(function (s, b) { return s + (b.mandatory ? b.words : 0); }, 0);
    list.forEach(function (b) { if (b.mandatory) S.add(b); else if (b.words <= room) { S.add(b); room -= b.words; } });
    return list.filter(function (b) { return S.beats.indexOf(b) < 0; });   // what was left over
  };

  function sentences(text) { return (String(text).match(/[^.!?]+[.!?]+["”]?|[^.!?]+$/g) || [text]).map(function (s) { return s.trim(); }).filter(Boolean); }
  // Paragraphs of 15–40 words from one text: the fewest groups of whole
  // sentences with every group in range. A text that cannot be cut that way
  // is kept whole, and the checks report it.
  function chunk(text) {
    var s = sentences(text), n = s.length, wc = s.map(words), best = [0], from = [-1];
    for (var i = 1; i <= n; i++) {
      best[i] = Infinity; from[i] = -1;
      for (var j = i - 1, sum = 0; j >= 0; j--) { sum += wc[j]; if (sum > 40) break; if (sum >= 15 && best[j] + 1 < best[i]) { best[i] = best[j] + 1; from[i] = j; } }
    }
    if (!n || best[n] === Infinity) return [String(text).trim()];
    var out = [];
    for (var k = n; k > 0; k = from[k]) out.unshift(s.slice(from[k], k).join(" "));
    return out;
  }
  /* The brief's paragraph counts: too few, and the longest paragraphs are
     split at a sentence where both halves keep 15 words; too many, and the
     shortest neighbours in one section are joined. The words do not change. */
  function balance(list, lo, hi) {
    var guard = 0;
    while (list.length < lo && guard++ < 300) {
      var best = -1, split = null, score = -1;
      list.forEach(function (b, i) {
        if (b.words < 30) return;
        var s = sentences(b.text);
        for (var j = 1; j < s.length; j++) {
          var a = s.slice(0, j).join(" "), c = s.slice(j).join(" "), wa = words(a), wc = words(c);
          if (wa >= 15 && wc >= 15 && Math.min(wa, wc) > score) { score = Math.min(wa, wc); best = i; split = [a, c]; }
        }
      });
      if (best < 0) break;
      var b = list[best];
      list.splice(best, 1, Object.assign({}, b, { text: split[0], words: words(split[0]) }),
        Object.assign({}, b, { text: split[1], words: words(split[1]), mandatory: false, scene: Object.assign({}, b.scene, { text: null, shot: null }) }));
    }
    guard = 0;
    while (list.length > hi && guard++ < 300) {
      var bi = -1, bs = 99;
      for (var i = 0; i + 1 < list.length; i++) { var sum = list[i].words + list[i + 1].words; if (sum <= 40 && sum < bs && list[i].section === list[i + 1].section) { bs = sum; bi = i; } }
      if (bi < 0) break;
      list.splice(bi, 2, Object.assign({}, list[bi], { text: list[bi].text + " " + list[bi + 1].text, words: bs, mandatory: list[bi].mandatory || list[bi + 1].mandatory }));
    }
    return list;
  }

  function build(event, res, opts) {
    opts = opts || {};
    if (!res || res.errors.length || !res.zs.length) return null;
    var L = LENGTHS[opts.length] ? opts.length : 10, spec = LENGTHS[L];
    var variation = Math.max(1, Math.min(19, parseInt(opts.variation, 10) || 1));
    var D = digest(event, res, spec);
    if (!D.first || !D.star || !D.ys.length) return null;
    var eraKey = ERAS[opts.era] ? opts.era : (D.firstYear < 500 ? "ancient" : D.firstYear < 1500 ? "medieval" : "golden");
    var era = ERAS[eraKey];
    var A = clampWords(String(opts.anchor || "").trim() || "Natori", 3);
    var title = clampWords(String(opts.title || "").trim() || event.name || "This event", 6);
    var R = rng(hashText(JSON.stringify((event.x_dates || []).map(function (x) { return x.date; })) + "|" + (event.name || "")) + variation * 138 + 19);
    var cast = buildCast(era, A, { watchman: D.hh });
    var castByKey = {}; cast.forEach(function (c) { castByKey[c.key] = c; });

    // A beat: the first variant (in a seeded rotation) that fits 15–40 words;
    // a text that fits nothing is cut into paragraphs that do.
    function beat(section, kind, variants, scene, mandatory) {
      var n = variants.length, k = R.int(n), text = "";
      for (var i = 0; i < n; i++) { var t = variants[(k + i) % n]; if (t && fits(t)) { text = t; break; } }
      var parts = text ? [text] : chunk(variants.filter(Boolean)[0] || "");
      return parts.map(function (p, j) {
        p = p.replace(/\s+/g, " ").trim();
        return { text: p, words: words(p), kind: kind, section: section, mandatory: !!mandatory, scene: j ? Object.assign({}, scene, { text: null, shot: null }) : scene };
      });
    }
    function sc(cast, setting, action, extra) { return Object.assign({ cast: cast, setting: setting, action: action }, extra || {}); }

    var F = D.first, Fw = F.w, star = D.star, Sw = star.w, y1 = D.ys[0], n = D.xs.length, ops = D.ops.length;
    var starMsrf = star.msrf.length ? star.msrf[0] : null;
    var desk = era.desk, J1 = CH.jdn(Fw.y, Fw.m, Fw.d);
    var sections = {}, order = [];
    SECTIONS.forEach(function (s) { sections[s[0]] = new Section(s[0], s[1], 0); order.push(s[0]); });
    var target = Math.round((spec.words[0] + spec.words[1]) / 2), shareSum = 0;
    Object.keys(spec.shares).forEach(function (k) { shareSum += spec.shares[k]; });
    order.forEach(function (k) { sections[k].budget = Math.round(target * spec.shares[k] / shareSum); });
    var away = star.rz.distance >= 0;

    /* ----------------------------------------------------------- hook -- */
    var cand = [].concat(
      beat("hook", "hook", [
        "Picture " + weekdayOf(Fw) + ", " + longDate(Fw) + ". " + A + " sits at " + desk + ", dips a pen, and writes one date at the top of a clean page. Nothing else. Just the date.",
        "It's " + longDate(Fw) + ". " + A + " writes a single date at the head of a ledger and underlines it twice. The count starts here.",
        longDate(Fw) + ". A date, a pen, a page. " + A + " writes it down, underlines it, and waits for the next one."
      ], sc(["anchor"], "study", A + " at " + desk + ", pen touching the page, writing the first date; eyes down, one eyebrow lifted, the lamp close", { shot: "MEDIUM", text: longDate(Fw), duration: 6 }), true),
      beat("hook", "hook", n > 1 ? [
        "Over the next " + num(D.span) + " days, " + wordNum(n - 1) + " more " + plural(n - 1, "date goes", "dates go") + " under it, the last on " + longDate(D.last.w) + ". Between the first two: " + num(y1.Y) + " days. Read " + num(y1.Y) + " backwards and you get " + num(y1.flip) + ". Remember that.",
        cap(wordNum(n - 1)) + " more " + plural(n - 1, "date follows", "dates follow") + ", the last on " + longDate(D.last.w) + ". The gap between the first two is " + num(y1.Y) + " days. Backwards, " + num(y1.Y) + " reads " + num(y1.flip) + ". Remember that number.",
        cap(wordNum(n - 1)) + " more " + plural(n - 1, "date follows", "dates follow") + ". The first gap is " + num(y1.Y) + " days. Backwards, that's " + num(y1.flip) + ". Remember that number; it comes back."
      ] : ["A second date follows. The gap is " + num(y1.Y) + " days. Backwards, that's " + num(y1.flip) + ". Remember that number; it comes back."],
        sc(["anchor"], "study", "the page from above: a column of dates in brown ink, the day-count written beside the first gap and the same digits reversed beneath it", { shot: "EXTREME CLOSE-UP", text: num(y1.Y) + " → " + num(y1.flip), duration: 5 }), true),
      beat("hook", "hook", [
        "Here's the thing nobody tells you. Run those " + n + " dates through " + ops + " small formulas and they stop pointing at the past. They point at " + longDate(Sw) + ": score " + star.score + ", " + star.hits + " hits. Wait, what?",
        "Feed those " + n + " dates to " + ops + " formulas and something odd happens. Almost all of them miss. A few land on the same " + (away ? "future" : "single") + " day: " + longDate(Sw) + ". Wait, what?",
        "Feed the dates to " + ops + " formulas. Most miss. Several land on one day" + (away ? " nobody has lived yet" : "") + ": " + longDate(Sw) + ". Wait, what?"
      ], sc([], "study", "the date alone on aged parchment, brown ink, a small serpent drawn beneath it biting its own tail", { shot: "TEXT CARD", text: longDate(Sw), duration: 5 }), true),
      beat("hook", "hook", [
        "That day is " + num(Math.abs(star.rz.distance)) + " days " + (away ? "away" : "behind us") + ", " + compareDays(star.rz.distance) + ". This is the story of how a handful of dates, a serpent's arithmetic and the number " + (starMsrf ? num(starMsrf.number) : num(y1.Y)) + " meet on a calendar.",
        num(Math.abs(star.rz.distance)) + " days " + (away ? "from today" : "ago") + ", " + compareDays(star.rz.distance) + ". A handful of dates, a serpent's arithmetic and the number " + (starMsrf ? num(starMsrf.number) : num(y1.Y)) + ", all meeting on one calendar square."
      ], sc(["anchor"], "exterior", A + " a small figure on the causeway at dusk, ledger under one arm, looking toward the horizon", { shot: "EXTREME WIDE", duration: 7 })),
      beat("hook", "hook", [
        "Stay for the ending. It closes on the same page this opened on, the same date underlined twice, and by then the serpent has eaten its own tail.",
        "Stay to the end. The film closes where it opened, on the same page, the same date underlined twice, with the serpent's tail in its mouth."
      ], sc(["anchor"], "study", A + " looking up from the page straight at the viewer, the pen paused, the faintest smile", { shot: "CLOSE-UP", duration: 5 }))
    );
    sections.hook.fill(cand);

    /* -------------------------------------------------------- origins -- */
    cand = [];
    cand = cand.concat(beat("origins", "etymology", [
      "The method is called Ophis, and Ophis is Greek for serpent: a line that curls back to bite its own tail. You feed it dates. It feeds you dates back.",
      "Its name is Ophis, Greek for serpent, the line that curls round to bite its own tail. Give it dates and it gives you dates."
    ], sc(["anchor"], "study", A + " tracing a serpent drawn in the ledger's margin with one ink-stained finger, head tilted", { shot: "OVER-SHOULDER", duration: 7 }), true));
    D.xs.slice(1).forEach(function (x, i) {
      var prev = D.xs[i], y = D.ys.find(function (p) { return p.x2 === x.i && p.x1 === prev.i; }) || D.ys[i] || y1;
      var calNames = ["Hebrew", "Julian Day", "Coptic", "Islamic", "Maya", "Persian", "Egyptian civil", "Julian"], cn = calNames[i % calNames.length], cv = spoken(x.cal, cn);
      var calLine = cn === "Julian Day" ? "Its Julian Day number is " + cv + "." : "On the " + cn + " calendar that reads " + cv + ".";
      cand = cand.concat(beat("origins", "anchor", [
        x.label + " lands on " + longDate(x.w) + ", " + num(y.Y) + " days after " + prev.label + ": " + compareDays(y.Y) + ". " + calLine,
        x.label + ": " + longDate(x.w) + ", a " + weekdayOf(x.w) + ", " + num(y.Y) + " days on. " + (cn === "Julian Day" ? "Julian Day " + cv + ", to the astronomers." : "The " + cn + " reckoning calls it " + cv + "."),
        x.label + " is " + longDate(x.w) + ", " + num(y.Y) + " days after " + prev.label + ". Write it under the first."
      ], sc(["anchor", "surveyor"], i % 2 ? "exterior" : "study", i % 2 ? "the Surveyor pacing a measured line with the knotted cord while " + A + " counts the knots aloud" : A + " adding a date below the first while the Surveyor leans in, one eyebrow up", { text: longDate(x.w), duration: 7 }), i < 2));
    });
    cand = cand.concat(beat("origins", "context", [
      "Every pair of dates gives a Y: the whole days between them. " + n + " dates make " + D.pairs + " " + plural(D.pairs, "pair") + ". " + D.pairs + " " + plural(D.pairs, "pair") + " meet " + ops + " formulas, and that's " + num(D.pairs * ops) + " projections before anyone has finished their coffee.",
      "Y is the day-count between a pair of dates. " + n + " dates give " + D.pairs + " " + plural(D.pairs, "pair") + "; " + D.pairs + " " + plural(D.pairs, "pair") + " through " + ops + " formulas give " + num(D.pairs * ops) + " projections. The serpent is not a minimalist."
    ], sc(["anchor", "crowd"], "market", A + " at a stall counting on " + era.counting + " while the crowd haggles behind, a goose underfoot", { shot: "WIDE", duration: 8 }), true));
    cand = cand.concat(beat("origins", "etymology", [
      "Three constants do the heavy lifting: pi, spoken as 3.14; phi, the golden ratio, 1.618; and their product, 5.08, called the curvature. A fourth, 7.01, is the hepta-cycle. Hepta is Greek for seven.",
      "Four constants: pi as 3.14, phi as 1.618, their product 5.08 called the curvature, and 7.01, the hepta-cycle. Hepta is simply the Greek for seven."
    ], sc(["astronomer"], "observatory", "the Astronomer scratching four numbers onto a wax tablet by lamplight, the missing tooth showing as the mouth counts", { shot: "MEDIUM", text: "3.14 · 1.618 · 5.08 · 7.01", duration: 8 }), true));
    if (D.flipOp) cand = cand.concat(beat("origins", "context", [
      "Formula " + (D.flipOp.index + 1) + " reads Y backwards. " + num(y1.Y) + " becomes " + num(y1.flip) + ". It's the cheapest trick in the book, and it " + (D.flipOp.weight >= C.POINTS_ALPHA ? "counts for a full point" : "counts for half a point") + ".",
      "One formula simply reverses the digits of Y: " + num(y1.Y) + " turns into " + num(y1.flip) + ". Cheap, yes. It " + (D.flipOp.weight >= C.POINTS_ALPHA ? "still scores a full point" : "still scores half a point") + "."
    ], sc(["anchor"], "study", "the ledger's number beside " + era.mirror + " that shows it reversed, " + A + "'s hand holding the mirror steady", { shot: "EXTREME CLOSE-UP", text: num(y1.Y) + " ⇄ " + num(y1.flip), duration: 7 })));
    cand = cand.concat(beat("origins", "etymology+today", [
      "Meton of Athens notices, around 432 BC, that nineteen years hold two hundred and thirty-five moons. The Hebrew calendar still runs on his gear, and so does the date of Easter.",
      "Around 432 BC, Meton of Athens works out that nineteen years hold two hundred and thirty-five moons. The Hebrew calendar still turns on that gear today. So does Easter."
    ], sc(["astronomer"], "observatory", "the Astronomer sighting the moon along a stretched cord, the wax tablet marked with nineteen strokes", { shot: "LOW ANGLE", duration: 8 }), true));
    cand = cand.concat(beat("origins", "today", [
      "Astronomers still count days the way Joseph Scaliger set them in 1583: one running number since 4713 BC, no months, no resets. Our first date is day " + num(J1) + ".",
      "Astronomers still count days the way Scaliger set them in 1583: one running number since 4713 BC. Our first date is day " + num(J1) + "."
    ], sc(["anchor"], "study", "a long tally of strokes running the length of the page, " + A + "'s pen adding one more at the bottom", { shot: "HIGH ANGLE / BIRD'S EYE", text: num(J1), duration: 7 }), true));
    cand = cand.concat(beat("origins", "context", [
      "In the Archaix chronology this app keeps, " + Fw.y + " is Annus Mundi " + num(F.cyc.am) + ": " + num(F.cyc.am) + " years from a Year One set at 3895 BC. Treat it as a thesis, not a textbook. The arithmetic, though, is exact.",
      "The Chronicon counts " + Fw.y + " as Annus Mundi " + num(F.cyc.am) + ", from a Year One placed at 3895 BC. That is the Archaix thesis of Jason Breshears: a reading, not a textbook."
    ], sc(["anchor"], "wall", A + " standing before the painted calendar tables, one hand raised to the Annus Mundi column", { shot: "FOREGROUND-FRAMED", text: "AM " + num(F.cyc.am), duration: 8 })));
    D.ops.forEach(function (op, i) {
      if (op === D.flipOp) return;
      var z = op.fn(100); if (!Number.isFinite(z)) return;
      var cls = op.weight >= C.POINTS_ALPHA ? "an alpha, worth a full point" : "a beta, worth half a point";
      cand = cand.concat(beat("origins", "operation", [
        "Formula " + (op.index + 1) + " is X" + op.startingX + " plus " + describeEquation(op.equation) + ", " + cls + ". Feed it a Y of one hundred and it hands back " + num(NC.round2(z)) + " days.",
        "Number " + (op.index + 1) + ": " + describeEquation(op.equation) + ", added to X" + op.startingX + ". " + cap(cls) + ". At Y one hundred it gives " + num(NC.round2(z)) + "."
      ], sc(i % 2 ? ["astronomer"] : ["anchor"], i % 2 ? "observatory" : "study", i % 2 ? "the Astronomer working a formula on the wax tablet, stylus moving, lips counting" : A + " writing a formula in the margin and testing it against the tally", { duration: 7 })));
    });
    if (D.before.length) cand = cand.concat(beat("origins", "ledger", [
      "The Chronicon's ledger has its own entries around these years. The last before our first date reads " + CH.fmtYear(D.before[D.before.length - 1][0]) + ": " + ledgerClause(D.before[D.before.length - 1]) + ". A thesis, remember, not a textbook.",
      "Before our first date the ledger's last line is " + CH.fmtYear(D.before[D.before.length - 1][0]) + ": " + ledgerClause(D.before[D.before.length - 1]) + ". Read it as the chronology reads it."
    ], sc(["crowd"], "ruin", "the crowd fleeing along the quay under the red sky, one figure looking back", { shot: "WIDE", duration: 6 })));
    cand = cand.concat(beat("origins", "context", [
      "Our first date wears nineteen names at once. " + spoken(F.cal, "Hebrew") + ". " + spoken(F.cal, "Islamic") + ". " + spoken(F.cal, "Coptic") + ". " + spoken(F.cal, "Persian") + ". Nineteen calendars, and only one of them is on your phone.",
      "One day, nineteen names: " + spoken(F.cal, "Hebrew") + " to the Hebrews, " + spoken(F.cal, "Islamic") + " to the Muslims, " + spoken(F.cal, "Coptic") + " to the Copts. Only one of the nineteen is on your phone."
    ], sc(["anchor"], "wall", A + " walking the length of the painted wall, reading each table in turn, fingertips brushing the plaster", { shot: "FOREGROUND-FRAMED", duration: 8 })));
    READINGS.forEach(function (name, i) {
      var big = spoken(F.cal, name), meta = spokenMeta(F.cal, name);
      if (!big || big === "—") return;
      cand = cand.concat(beat("origins", "reading", [
        "On the " + name + " calendar our first date reads " + big + ": " + meta + ".",
        "The " + name + " reckoning has our first date as " + big + ". " + cap(meta) + ".",
        "To the " + name + " count, our first date is " + big + ". One day on the wall, one more name for it, and none of them wrong."
      ], sc(i % 2 ? ["astronomer"] : ["anchor"], "wall", i % 2 ? "the Astronomer reading one calendar table aloud, finger on the line" : A + " copying one calendar table into the ledger, tongue between the teeth", { duration: 7 })));
    });
    if (F.moon) cand = cand.concat(beat("origins", "context", [
      "The moon over the first date is " + moonPhrase(F.moon.name) + ", " + F.moon.age.toFixed(1) + " days old and " + F.moon.lit + " percent lit. Write that down too. The moon comes back into this.",
      "That first night the moon is " + moonPhrase(F.moon.name) + ", " + F.moon.age.toFixed(1) + " days into its month, " + F.moon.lit + " percent lit. Note it. The moon returns later."
    ], sc(["anchor"], "observatory", A + " small on the roof under the sky, the moon low and painted, the ledger closed", { shot: "EXTREME WIDE", duration: 8 })));
    if (D.hh) cand = cand.concat(beat("origins", "context", [
      "Here the day begins at sunset over " + D.place + ", the way the old reckoning ran it. " + D.zone + " time. Every Y counts sunsets, not midnights, and every projected day is a window from one sunset to the next.",
      "Days here run sunset to sunset over " + D.place + ", as the ancients counted them. Y counts sunsets, not midnights."
    ], sc(["watchman"], "exterior", "the Watchman on the wall, horn raised, the sun touching the horizon behind him", { shot: "WIDE", duration: 7 })));
    cand = cand.concat(beat("origins", "etymology", [
      "Calendar comes from the Roman kalendae, the first of the month, when debts were called in. Every calendar is a way of being owed something.",
      "The word calendar is Roman: the kalendae were the first of the month, the day the debts came due. A calendar is a ledger of what is owed."
    ], sc(["anchor", "crowd"], "market", A + " at a moneychanger's table, a ledger open, the crowd's faces turned toward the coins", { shot: "MEDIUM", duration: 7 })));
    cand = cand.concat(beat("origins", "today", [
      "The calendar on your phone is Pope Gregory's, from 1582. It dropped ten days to catch up with the sun. It still exists, and it still needs a leap year to stay honest.",
      "Your phone's calendar is Gregory's of 1582, which dropped ten days to catch the sun. It still runs the world, leap years and all."
    ], sc(["crowd"], "market", "the crowd from above in the square, a scribe's stall at the centre", { shot: "HIGH ANGLE / BIRD'S EYE", duration: 7 })));
    if (F.cyc.baktun) cand = cand.concat(beat("origins", "context", [
      "The Maya Long Count runs in baktuns of 144,000 days. Our first date sits in baktun " + F.cyc.baktun.n + " of thirteen; in this chronology the count closes in 2046.",
      "On the Maya Long Count, which counts in baktuns of 144,000 days, our first date falls in baktun " + F.cyc.baktun.n + " of thirteen. The count closes in 2046."
    ], sc(["anchor"], "map", "the painted map from above, thirteen stone markers in a curve, " + A + "'s hand resting on the " + F.cyc.baktun.n + "th", { shot: "MAP VIEW", duration: 8 })));
    cand = cand.concat(beat("origins", "return", [
      "Now, back to " + A + "'s page. " + n + " dates, " + D.pairs + " " + plural(D.pairs, "gap") + ", " + ops + " formulas. The serpent is about to start eating.",
      "Back to the ledger, then. " + n + " dates, " + D.pairs + " " + plural(D.pairs, "gap") + " between them, " + ops + " formulas waiting. The serpent is hungry."
    ], sc(["anchor"], "study", A + " turning back to the ledger, pen lifted, the serpent in the margin catching the light", { shot: "OVER-SHOULDER", duration: 7 }), true));
    sections.origins.fill(cand);

    /* ----------------------------------------------------- escalation -- */
    var TRANS = [
      function () { return beat("escalation", "transition", ["But here's the catch. Agreement is cheap when the formulas share a Y. The strong days are the ones where different pairs, different constants, land together."], sc(["anchor"], "map", A + " laying two cords across the map so they cross at one marker", { duration: 7 })); },
      function () { return beat("escalation", "transition", ["So how does a day-count become a date? You add it to one of the anchors: X1 for some formulas, X2 for the rest. That is the whole trick, and it is enough."], sc(["anchor"], "study", A + "'s hand walking two fingers along the page from one date to the next", { shot: "EXTREME CLOSE-UP", duration: 7 })); },
      function () { return beat("escalation", "return", ["Now, back to " + A + ", who has been drawing lines between the pages. The lines are starting to cross, and " + A.split(" ")[0] + " has noticed."], sc(["anchor"], "study", A + " looking down at a page criss-crossed with ink lines, the head tilting", { shot: "OVER-SHOULDER", duration: 7 })); },
      function (z, nextZ) { return nextZ ? beat("escalation", "transition", ["Remember " + longDate(z.w) + "? Hold it. " + nextZ.t.ops.length + " " + plural(nextZ.t.ops.length, "formula is", "formulas are") + " about to agree on something stronger."], sc(["anchor"], "study", A + " pausing mid-stroke, eyes lifting to the middle distance", { shot: "CLOSE-UP", duration: 5 })) : []; },
      function () { return beat("escalation", "transition", ["Why those numbers? Because they are on the list. The list holds " + C.MSRF_NORMAL.length + " normal numbers, " + C.MSRF_IMPORTANT.length + " important ones and " + C.MSRF_VORTEX.length + " vortex values, and the serpent does not argue with the list."], sc(["astronomer"], "wall", "the Astronomer reading a long column of numbers on the wall, lips moving", { shot: "LOW ANGLE", duration: 8 })); },
      function (z) { return beat("escalation", "transition", ["For scale: " + num(Math.abs(z.out || z.rz.distance)) + " days is " + compareDays(z.out || z.rz.distance) + ". History does not hurry, and neither does the serpent."], sc(["crowd"], "market", "the crowd going about its business, oblivious, a child counting on its fingers in the foreground", { shot: "WIDE", duration: 6 })); }
    ];
    function zBeats(z, k) {
      var h = z.t.ops[0], op = h.r.op, from = op.startingX === 1 ? h.y.x1 : h.y.x2, nOps = z.t.ops.length, names = formulaNames(z.t.ops);
      var setting = ["map", "observatory", "study"][k % 3], cardShot = k % 4 === 3;
      var out = beat("escalation", "zdate", [
        longDate(z.w) + ". " + cap(wordNum(nOps)) + " " + plural(nOps, "formula lands", "formulas land") + " here: " + names + ". Take X" + (h.y.x1 + 1) + " to X" + (h.y.x2 + 1) + ", Y equals " + num(h.y.Y) + "; " + describeEquation(op.equation) + " gives " + num(h.r.zValue) + " days from X" + (from + 1) + ". Add them, and there's the day.",
        longDate(z.w) + ": " + wordNum(z.hits) + " " + plural(z.hits, "hit") + ". " + cap(names) + ". Y is " + num(h.y.Y) + "; " + describeEquation(op.equation) + " makes " + num(h.r.zValue) + "; " + num(h.r.zValue) + " days from X" + (from + 1) + " is this day.",
        longDate(z.w) + ". " + (nOps > 1 ? cap(wordNum(nOps)) + " formulas land here, formula " + (h.r.opIndex + 1) + " among them" : "Formula " + (h.r.opIndex + 1) + " lands here") + ": Y " + num(h.y.Y) + ", " + describeEquation(op.equation) + ", " + num(h.r.zValue) + " days from X" + (from + 1) + "."
      ], sc(cardShot ? [] : ["anchor"], cardShot ? "study" : setting, cardShot ? "the date on aged parchment with a small stone marker drawn beside it" : A + " placing a stone marker on the map's line of dates, then a second one on the same spot", cardShot ? { shot: "TEXT CARD", text: longDate(z.w), duration: 6 } : { text: longDate(z.w), duration: 7 }));
      var m = z.msrf.length ? z.msrf[0] : null, marks = [], sky = z.sky && (z.sky.eclipse || z.sky.moon);
      if (z.rz.palindrome) marks.push("Written as " + digitsOf(z.w) + ", the date reads the same backwards.");
      if (z.rz.by138) marks.push("It is " + num(Math.abs(z.rz.distance)) + " days from today: one hundred and thirty-eight times " + num(Math.abs(z.rz.distance) / 138) + ".");
      else if (z.rz.by19) marks.push("It is " + num(Math.abs(z.rz.distance)) + " days from today: nineteen times " + num(Math.abs(z.rz.distance) / 19) + ".");
      if (z.sky && z.sky.moon) marks.push("A " + z.sky.moon + " hangs within a day of it.");
      if (z.sky && z.sky.eclipse) marks.push("A " + z.sky.eclipse + " falls within a day of it. Make of that what you will.");
      var full = m ? cap(hitLine(m)) + ". The match multiplies: the score " + (m.cls.mult >= 2 ? "doubles, to " : "climbs by half, to ") + z.score + ". " + marks.join(" ")
        : marks.length ? "No special number here, just " + wordNum(nOps) + " " + plural(nOps, "formula") + " agreeing, for a score of " + z.score + ". " + marks.join(" ")
        : "No special number, no moon, nothing in the mirror: just " + wordNum(nOps) + " " + plural(nOps, "formula") + " agreeing. Score " + z.score + ". Keep it in your pocket.";
      var brief = m ? cap(hitLine(m)) + ". The score climbs to " + z.score + "." : "Score " + z.score + ", " + wordNum(z.hits) + " " + plural(z.hits, "hit") + ". Nothing on the list, nothing in the sky. Keep it in your pocket.";
      return out.concat(beat("escalation", "zdate", [full, brief], sc(sky ? ["astronomer"] : ["anchor"], sky ? "observatory" : "study",
        sky ? "the Astronomer pointing up at the " + sky + ", mouth open, the tablet forgotten" : A + "'s face lit from below by the lamp, eyebrows rising as the number lands", { shot: sky ? "LOW ANGLE" : "CLOSE-UP", duration: m ? 8 : 7 })));
    }
    function ledgerBeat(e, k) {
      var c = CH.cycles(e[0]), yr = CH.fmtYear(e[0]);
      return beat("escalation", "ledger", [
        "The ledger, meanwhile, keeps its own count. Its entry for " + yr + " reads: " + ledgerClause(e) + ". In this chronology that is Annus Mundi " + num(c.am) + ".",
        yr + ", says the ledger: " + ledgerClause(e) + ". Annus Mundi " + num(c.am) + ", " + (c.phoenix.into === 0 ? "a Phoenix node year" : c.phoenix.to + " years short of the Phoenix node of " + CH.fmtYear(c.phoenix.next)) + ".",
        "Somewhere on the same count sits " + yr + ": " + ledgerClause(e) + ", as the ledger has it. Not a textbook; a thesis with a very long memory."
      ], sc(["crowd"], k % 3 === 2 ? "market" : "ruin", k % 3 === 2 ? "the crowd in the square, heads turning up as a shadow crosses the sun" : "the crowd under the red sky, ash on their shoulders, one figure clutching a ledger", { shot: k % 2 ? "WIDE" : "EXTREME WIDE", text: yr, duration: 6 }));
    }
    cand = [];
    D.ladder.forEach(function (z, k) {
      cand = cand.concat(zBeats(z, k));
      if (k % 2 === 1) cand = cand.concat(TRANS[Math.floor(k / 2) % TRANS.length](z, D.ladder[k + 1] || star));
    });
    var E = sections.escalation, reserve = E.fill(cand);
    D.reserveZ.forEach(function (z, k) { reserve = reserve.concat(zBeats(z, k + D.ladder.length)); });
    D.after.concat(D.others).forEach(function (e, k) {
      reserve = reserve.concat(ledgerBeat(e, k));
      if (k % 3 === 2) reserve = reserve.concat(TRANS[k % TRANS.length](star, null));
    });

    /* --------------------------------------------------------- climax -- */
    cand = [];
    var pairsOnStar = {}; star.t.ops.forEach(function (h) { pairsOnStar[h.y.x1 + "-" + h.y.x2] = true; });
    var nPairs = Object.keys(pairsOnStar).length;
    cand = cand.concat(beat("climax", "climax", [
      "And then the wheels agree. " + longDate(Sw) + ", a " + weekdayOf(Sw) + ": " + wordNum(star.hits) + " " + plural(star.hits, "hit") + ", score " + star.score + ", the strongest day the serpent finds in this event. " + cap(wordNum(star.t.ops.length)) + " " + plural(star.t.ops.length, "formula") + " from " + wordNum(nPairs) + " different " + plural(nPairs, "pair") + " " + plural(star.t.ops.length, "lands", "land") + " on it.",
      "Then the wheels agree. " + longDate(Sw) + ": " + wordNum(star.hits) + " " + plural(star.hits, "hit") + ", score " + star.score + ", the strongest day in the whole cast, with " + wordNum(star.t.ops.length) + " " + plural(star.t.ops.length, "formula") + " landing on it."
    ], sc([], "study", "the strongest date alone on parchment, the ink still wet, the serpent beneath it now swallowing its tail completely", { shot: "TEXT CARD", text: longDate(Sw), duration: 8 }), true));
    star.t.ops.forEach(function (h, i) {
      var op = h.r.op, from = op.startingX === 1 ? h.y.x1 : h.y.x2, m = star.msrf.find(function (x) { return x.r === h.r; });
      cand = cand.concat(beat("climax", "derivation", [
        "Formula " + (h.r.opIndex + 1) + ": from X" + (h.y.x1 + 1) + " to X" + (h.y.x2 + 1) + ", Y is " + num(h.y.Y) + "; " + describeEquation(op.equation) + " gives " + num(h.r.zValue) + "; " + num(h.r.zValue) + " days from X" + (from + 1) + " lands here" + (m ? ", and " + hitLine(m) : "") + ". " + (op.weight >= C.POINTS_ALPHA ? "A full point." : "Half a point."),
        "Formula " + (h.r.opIndex + 1) + " takes Y " + num(h.y.Y) + " from X" + (h.y.x1 + 1) + " to X" + (h.y.x2 + 1) + ", makes " + num(h.r.zValue) + " with " + describeEquation(op.equation) + ", and lands here from X" + (from + 1) + ". " + (op.weight >= C.POINTS_ALPHA ? "One point." : "Half a point.")
      ], sc(["anchor"], "map", i % 2 ? A + " drawing a line from one marker to the strongest one, the cord pulled taut across the map" : A + " lit from below by the lamp, tracing the crossing lines with a fingertip", { shot: i % 2 ? "MAP VIEW" : "LOW ANGLE", duration: 8 })));
    });
    if (starMsrf) {
      var base = star.t.opScore + NC.engine.msrfSubscore(star.msrf, res.system);
      cand = cand.concat(beat("climax", "climax", [
        cap(hitLine(starMsrf)) + ". Under the scoring used since version eight, the best match multiplies instead of adding. " + base + " " + plural(base, "point") + " times " + star.t.multiplier + " is " + star.score + ".",
        "The Z of " + cap(hitLine(starMsrf)).replace(/^\S+ /, num(starMsrf.r.z) + " ") + ". The best match multiplies: " + base + " " + plural(base, "point") + " times " + star.t.multiplier + " makes " + star.score + "."
      ], sc(["anchor"], "study", "the number circled twice in brown ink, " + A + "'s pen tip resting on the circle", { shot: "EXTREME CLOSE-UP", text: num(starMsrf.number), duration: 8 }), true));
    }
    var starMarks = [];
    if (star.rz.palindrome) starMarks.push("Written as " + digitsOf(Sw) + ", it reads the same backwards, a palindrome on the calendar.");
    if (star.rz.by138) starMarks.push("It stands " + num(Math.abs(star.rz.distance)) + " days from today, one hundred and thirty-eight times " + num(Math.abs(star.rz.distance) / 138) + ".");
    else if (star.rz.by19) starMarks.push("It stands " + num(Math.abs(star.rz.distance)) + " days from today, nineteen times " + num(Math.abs(star.rz.distance) / 19) + ".");
    if (star.sky.moon) starMarks.push("A " + star.sky.moon + " hangs within a day of it.");
    if (star.sky.eclipse) starMarks.push("A " + star.sky.eclipse + " crosses the sky within a day of it.");
    if (star.moon) starMarks.push("The moon that night is " + moonPhrase(star.moon.name) + ", " + star.moon.lit + " percent lit.");
    if (starMarks.length) cand = cand.concat(beat("climax", "climax", [starMarks.join(" ") + " None of that changes the score. All of it changes the mood.", starMarks.join(" ")],
      sc(["astronomer"], "observatory", "the Astronomer and the moon, the tablet raised to compare, the missing tooth showing in a grin", { shot: "LOW ANGLE", duration: 9 })));
    cand = cand.concat(beat("climax", "climax", [
      "Open that day on the Chronicon and it wears nineteen names: " + spoken(star.cal, "Hebrew") + "; " + spoken(star.cal, "Maya") + "; Julian Day " + num(CH.jdn(Sw.y, Sw.m, Sw.d)) + ". In this chronology it stands " + num(Math.abs(star.cyc.phoenix.to)) + " years before the next Phoenix node, " + CH.fmtYear(star.cyc.phoenix.next) + ".",
      "On the Chronicon that day is " + spoken(star.cal, "Hebrew") + " to the Hebrews and Julian Day " + num(CH.jdn(Sw.y, Sw.m, Sw.d)) + " to the astronomers, " + num(Math.abs(star.cyc.phoenix.to)) + " years short of the Phoenix node of " + CH.fmtYear(star.cyc.phoenix.next) + "."
    ], sc(["anchor"], "wall", A + " before the painted wall, every table now bearing the same day in a different script", { shot: "FOREGROUND-FRAMED", duration: 9 })));
    READINGS.slice(0, 8).forEach(function (name, i) {
      var big = spoken(star.cal, name), meta = spokenMeta(star.cal, name);
      if (!big || big === "—") return;
      cand = cand.concat(beat("climax", "reading", [
        "On the " + name + " calendar the day reads " + big + ": " + meta + ".",
        "The " + name + " count calls that day " + big + ". " + cap(meta) + ".",
        "To the " + name + " count the day is " + big + ". The same square on the wall, one more name for it, and the serpent lands on all of them."
      ], sc(i % 2 ? ["astronomer"] : ["anchor"], "wall", i % 2 ? "the Astronomer tapping one table on the wall with the stylus" : A + " reading one table on the wall, lips moving", { duration: 7 })));
    });
    D.tDates.slice(0, 2).forEach(function (t) {
      cand = cand.concat(beat("climax", "climax", [
        "You asked about " + longDate(t.w) + ". " + (t.hit ? "Something lands there: the table has a row for it, and the derivation shows which formulas agree." : "Nothing lands there. Not one formula, not one pair. The serpent has no opinion about that day, and no opinion is also an answer."),
        "There was a target date, " + longDate(t.w) + ". " + (t.hit ? "The serpent lands on it." : "The serpent misses it entirely, which is its own kind of answer.")
      ], sc(["anchor"], "study", A + " holding a second slip of paper against the ledger, comparing two dates, mouth pressed flat", { shot: "MEDIUM", text: longDate(t.w), duration: 8 })));
    });
    if (D.clocks.phoenix) cand = cand.concat(beat("climax", "climax", [
      "From today to 15 May 2040 is " + num(D.clocks.phoenix.days) + " days" + (D.clocks.phoenix.by138 ? ", one hundred and thirty-eight times " + num(D.clocks.phoenix.days / 138) : D.clocks.phoenix.by19 ? ", nineteen times " + num(D.clocks.phoenix.days / 19) : "") + ". The clock on the Chronicon counts them down by the second, and flags every multiple of nineteen and of one hundred and thirty-eight.",
      "The Chronicon's clock counts " + num(D.clocks.phoenix.days) + " days from today to 15 May 2040, the date the thesis sets for the Phoenix, and flags every multiple of nineteen and of 138."
    ], sc(["anchor"], "study", "the wall clock at 1:38 with " + A + "'s reflection in its glass, the pendulum mid-swing", { shot: "CLOSE-UP", text: num(D.clocks.phoenix.days) + " days", duration: 8 })));
    cand = cand.concat(beat("climax", "resolution", [
      "So what does the day mean? On its own, nothing. It is where " + ops + " rules of thumb agree, and agreement is not prophecy. The ledger says more than that. The ledger is a thesis.",
      "What does it mean? Nothing, on its own. It is where " + ops + " small formulas agree, and agreement is not prophecy. The Chronicon's ledger claims more; the ledger is a thesis, and this film says so."
    ], sc(["anchor"], "stone", A + " a small figure before the Stone at dawn, ledger under one arm, mist to the knees", { shot: "EXTREME WIDE", duration: 10 }), true));
    if (D.usedHidden) cand = cand.concat(beat("climax", "resolution", ["One honest note: every one of these days was hidden by the event's filters, so this film reads the full cast, past days included. Loosen a filter and the Studio rewrites itself."],
      sc(["anchor"], "study", A + " crossing out a line and writing it again", { shot: "EXTREME CLOSE-UP", duration: 7 })));
    sections.climax.fill(cand);

    /* --------------------------------------------------------- legacy -- */
    cand = [].concat(
      beat("legacy", "today", [
        "The Stone is still there. Petrie's survey of 1883 is still the reference, the Metonic gear still sets Easter every spring, and your phone still counts in Gregory's months.",
        "The Stone still stands. Petrie's 1883 survey is still the one the books cite, and the Metonic cycle still sets the date of Easter every spring."
      ], sc(["surveyor", "anchor"], "exterior", "the Surveyor and " + A + " small against the plateau, the monument rising behind them into haze", { shot: "WIDE", duration: 8 }), true),
      beat("legacy", "legacy", [
        "The numbers fold. First stone to the Flood, in this chronology, is 666 years, a palindrome. The capstone year, Annus Mundi 1080, is the Moon's radius in miles. Coincidence has a very good memory.",
        "The numbers fold on themselves. In this chronology the first stone to the Flood is 666 years, a palindrome, and the capstone year 1080 is the Moon's radius in miles."
      ], sc(["surveyor"], "stone", "the Surveyor sighting up the flank of the Stone with the plumb line, dawn light on the beard", { shot: "LOW ANGLE", duration: 8 })),
      beat("legacy", "legacy", [
        "Nineteen mirrors to ninety-one. One hundred and thirty-eight mirrors to eight hundred and thirty-one, and " + (D.flipOp ? "formula " + (D.flipOp.index + 1) : "the serpent") + " has been reading numbers backwards the whole time.",
        "Nineteen reads back as ninety-one; 138 reads back as 831. " + (D.flipOp ? "Formula " + (D.flipOp.index + 1) : "The serpent") + " has been doing this in front of you all along."
      ], sc(["anchor"], "study", "the glyph 138 on the page beside " + era.mirror + ", where it reads 831", { shot: "EXTREME CLOSE-UP", text: "138 ⇄ 831", duration: 7 })),
      beat("legacy", "ending", [
        A + " turns back to the first page. " + longDate(Fw) + ", underlined twice. The count starts here. It always did.",
        A + " turns the ledger back to its first page: " + longDate(Fw) + ", underlined twice. The count starts here. It always did."
      ], sc(["anchor"], "study", A + "'s face close, the pen lifting from the underlined date, eyes on the page", { shot: "CLOSE-UP", duration: 7 }), true),
      beat("legacy", "cta", [
        "Seed the dates, cast the numbers, read what survives; read, cast, seed. " + CTA,
        "Seed the dates. Cast the numbers. Read what survives. " + CTA
      ], sc(["anchor"], "study", A + " at " + desk + " exactly as in the first frame, pen touching the page, the lamp close, one eyebrow lifted", { shot: "MEDIUM", text: longDate(Fw), duration: 8 }), true)
    );
    sections.legacy.fill(cand);

    /* ------------------------------------------ the whole, to length -- */
    var all = function () { return order.reduce(function (acc, k) { return acc.concat(sections[k].beats); }, []); };
    var total = function () { return all().reduce(function (s, b) { return s + b.words; }, 0); };
    var lo = spec.words[0], hi = spec.words[1];
    // Short: reserve beats go into the escalation until the low bound is met.
    for (var ri = 0; total() < lo && ri < reserve.length; ri++) if (total() + reserve[ri].words <= hi) E.add(reserve[ri]);
    // Long: optional beats come off the end of the escalation, then the origins.
    [E, sections.origins].forEach(function (S) {
      for (var i = S.beats.length - 1; i >= 0 && total() > hi; i--) if (!S.beats[i].mandatory) { S.words -= S.beats[i].words; S.beats.splice(i, 1); }
    });
    var script = balance(all(), spec.paragraphs[0], spec.paragraphs[1]);
    // Still short of paragraphs, with nothing left to split: the shortest
    // reserve beats the word ceiling still allows.
    var extra = reserve.filter(function (b) { return E.beats.indexOf(b) < 0; }).sort(function (a, b) { return a.words - b.words; });
    for (var xi = 0; script.length < spec.paragraphs[0] && xi < extra.length; xi++) {
      if (total() + extra[xi].words > hi) continue;
      E.add(extra[xi]);
      script = balance(all(), spec.paragraphs[0], spec.paragraphs[1]);
    }
    // Still short, with the words at their ceiling: trade the longest optional
    // paragraph for the two shortest reserve beats that fit in its place.
    for (var guard = 0; script.length < spec.paragraphs[0] && guard < 8; guard++) {
      var longest = null, host = null, at = -1;
      [E, sections.origins].forEach(function (S) { S.beats.forEach(function (b, i) { if (!b.mandatory && (!longest || b.words > longest.words)) { longest = b; host = S; at = i; } }); });
      var pool = extra.filter(function (b) { return E.beats.indexOf(b) < 0; });
      if (!longest || pool.length < 2 || pool[0].words + pool[1].words > hi - (total() - longest.words)) break;
      host.words -= longest.words; host.beats.splice(at, 1);
      E.add(pool[0]); E.add(pool[1]);
      for (var pi = 2; total() < lo && pi < pool.length; pi++) if (total() + pool[pi].words <= hi) E.add(pool[pi]);
      script = balance(all(), spec.paragraphs[0], spec.paragraphs[1]);
    }
    script.forEach(function (b, i) { b.n = i + 1; });

    /* ---------------------------------------------------- the package -- */
    var castUsed = {};
    script.forEach(function (b) { (b.scene.cast || []).forEach(function (k) { castUsed[k] = true; }); });
    var castList = cast.filter(function (c) { return castUsed[c.key]; });
    var sides = ["left", "right"], prevShot = null, rot = 0;
    var images = script.map(function (b, i) {
      var scene = b.scene, set = era.settings[scene.setting] || era.settings.study;
      var shot = scene.shot || null;
      if (!shot || shot === prevShot) { do { shot = ROTATION[rot++ % ROTATION.length]; } while (shot === prevShot); }
      prevShot = shot;
      var side = sides[i % 2];
      var light = set.time === "night" ? "Single dominant warm amber light from " + era.lamp + " at frame " + side + ", 55% of the frame in deep shadow, warm amber rim light separating the character from the background, volumetric light through drifting dust and lamp smoke, atmospheric haze in the far corners."
        : set.time === "day" ? "Warm directional sunlight from high " + side + ", softer shadows covering 35% of the frame, golden-hour warmth, dust hanging in the air, distant forms fading into warm haze."
        : set.time === "dawn" ? "Low warm sunlight from the horizon at frame " + side + ", long soft shadows over 40% of the frame, mist glowing where the light crosses it, distant forms fading into pale gold haze."
        : set.time === "red" ? "Dim ember-red light from a darkened sun, 60% of the frame in shadow, ash drifting through shafts of dull light, warm rim light from scattered fires, the far city lost in red haze."
        : "Cool blue-grey overcast light overall, one warm amber accent from a doorway at frame " + side + ", 45% of the frame in shadow, mist and drifting smoke, distant forms lost in grey haze.";
      var who = (scene.cast || []).map(function (k) { return castByKey[k]; }).filter(Boolean);
      var parts = [cap(scene.action) + "."];
      if (who.length === 1) parts.push("One character, exactly as the Look Card describes: " + who[0].name + " — “" + who[0].card + "”");
      else if (who.length) parts.push(who.length + " characters, each exactly as their Look Cards describe them: " + who.map(function (c) { return c.name + " — “" + c.card + "”"; }).join(" "));
      else parts.push("No characters in frame.");
      parts.push("Background: " + set.desc + ", every surface with visible painted texture, weathered and lived-in.");
      parts.push("Environmental storytelling: " + set.details + ".");
      parts.push("Camera: " + shot + " — " + SHOTS[shot] + ".");
      parts.push("Lighting: " + light);
      parts.push("Color mood: " + era.palette + ", like a classical oil painting.");
      if (scene.text) parts.push("On-screen text in an aged serif font: “" + scene.text + "”.");
      parts.push(STYLE_TAG);
      return { n: b.n, paragraph: b.n, shot: shot, prompt: parts.join(" "), setting: scene.setting, time: set.time };
    });
    var clips = script.map(function (b, i) {
      var scene = b.scene, set = era.settings[scene.setting] || era.settings.study, img = images[i];
      var move = set.time === "red" ? "subtle handheld shake for tension, then a slow push-in" : CAMERA_MOVES[i % CAMERA_MOVES.length];
      var who = (scene.cast || []).map(function (k) { return castByKey[k]; }).filter(Boolean);
      var charMove = who.length ? cap(who[0].short) + (who.length > 1 ? " and " + who[1].short : "") + ": " + (img.shot === "CLOSE-UP" ? "a slow eyebrow raise, the eyes shifting once toward the page, the mouth opening slightly to speak" : img.shot === "EXTREME CLOSE-UP" ? "the hand moving slowly across the page, fingers pausing on the number, ink glinting wet" : img.shot === "EXTREME WIDE" ? "a slow walk of three steps, the head turning toward the horizon, the cloak stirring" : "a small turn of the head, one hand lifting in a slow gesture, weight shifting to the other foot") + "." : "";
      var graphics = img.shot === "TEXT CARD" ? "The words fade in letter by letter in the aged serif; a thin gold line draws itself beneath them and a small serpent glyph completes its circle." : img.shot === "MAP VIEW" ? "A thin gold line draws itself along the dates from the first marker to the last; each marker pulses once as the line reaches it." : "";
      var lightShift = set.time === "night" ? "The flame gutters once and steadies; the shadows breathe with it." : set.time === "dawn" ? "The light creeps a hand's breadth down the stone as the mist thins." : set.time === "red" ? "The red light pulses twice and dims." : "A cloud's shadow crosses the frame and passes.";
      var ending = i === script.length - 1 ? " In the final half-second the frame resolves back to the opening image of clip 1, the pen touching the first date, so the film closes where it began." : "";
      return { n: b.n, image: b.n, seconds: scene.duration || 7, prompt: ["Camera: " + move + ".", charMove, "Environment: " + set.motion + ".", "Lighting: " + lightShift, graphics, CLIP_SUFFIX + ending].filter(Boolean).join(" ") };
    });

    var thumbText = starMsrf ? num(starMsrf.number) : num(y1.Y) + " DAYS";
    var thumbnail = "YouTube thumbnail, 16:9 horizontal. Bold text “" + thumbText + "” in an ultra-bold aged serif, warm yellow with a dark outline and a drop shadow, covering half the frame at the upper left. Below it, smaller, in the same aged serif: “" + Fw.y + " – " + Sw.y + "”. Background: " + era.settings.stone.desc + ", dark and moody, the sky deepening to near-black at the top. " +
      castByKey.anchor.name + ", exactly as the Look Card describes: “" + castByKey.anchor.card + "” — in a dramatic pose at the lower right, turned toward the viewer, one hand flat on the open ledger, eyebrows raised, mouth slightly open, the oversized nose catching strong warm amber rim light from the left. High contrast: dark background, bright text, warm-lit character. No watermarks, no extra text, no clutter. " + STYLE_TAG;

    var totalWords = total(), starLong = longDate(Sw);
    var titles = [
      "How " + n + " Dates Secretly Point to " + starLong,
      "The ENTIRE Story of " + title + " in " + L + " Minutes",
      "The Serpent's Trick That Turns " + num(y1.Y) + " Days Into a Date",
      "A Day in the Life of a Chronicler in " + Fw.y,
      "What Was Life Like Between " + Fw.y + " and " + Sw.y + "?"
    ].filter(function (t) { return t.length < 60; });
    var seoTitle = titles[(variation - 1) % titles.length];
    function mmss(w) { var s = Math.round(w / WPM * 60), m = Math.floor(s / 60); return m + ":" + T.pad(s % 60); }
    var acc = 0, sectionsOut = order.map(function (k) { var S = sections[k], o = { key: k, name: S.name, words: S.words, budget: S.budget, at: mmss(acc) }; acc += S.words; return o; });
    var tag = title.replace(/[^A-Za-z0-9]+/g, "");
    var description = [
      n + " dates. " + ops + " formulas. One day they all agree on" + (away ? ", and it hasn't happened yet." : "."),
      "This animated history of " + title + " follows " + n + " dates through the Ophis method, the serpent's arithmetic that turns the days between events into projected dates, and reads them on the Chronicon's nineteen calendars. " + cap(title) + " becomes a story of day-counts, mirrored numbers and the strongest day in the cast, " + starLong + ". If you have ever wondered what " + title + " looks like as pure arithmetic, this is it.",
      sectionsOut.map(function (s) { return s.at + " — " + s.name; }).join("\n"),
      "Subscribe for more animated history every week!",
      "This video is for educational and entertainment purposes. Some events have been simplified for clarity. The chronology follows the Archaix thesis of Jason Breshears, presented as a study instrument, not as established history.",
      "#AnimatedHistory #" + (tag || "History") + " #HistoryExplained"
    ].join("\n\n");
    var tags = [seoTitle, title + " history", title + " explained", title + " in " + L + " minutes", "Ophis", "Natorion Cipher", "date projection", "Archaix", "Jason Breshears", "Phoenix 138", "Metonic cycle", "Chronicon", "animated history", "history explained", "entire history", "cycles of history", "Great Pyramid", "calendar systems", "Annus Mundi", "number patterns"];
    var seen = {}; tags = tags.filter(function (t) { var k = t.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true; }).slice(0, 20);

    var plan = {
      length: L, seconds: spec.seconds, title: title, anchor: A, era: eraKey, eraName: era.name, variation: variation,
      generatedOn: longDate(D.todayW), eventName: event.name || "",
      words: totalWords, wordRange: spec.words, paragraphRange: spec.paragraphs, paragraphs: script.length,
      images: images.length, batches: Math.ceil(images.length / 5), clips: clips.length,
      sections: sectionsOut,
      script: script.map(function (b) { return { n: b.n, text: b.text, words: b.words, kind: b.kind, section: b.section }; }),
      cast: castList.map(function (c) { return { name: c.name, card: c.card, group: !!c.group }; }),
      imagePrompts: images, clipPrompts: clips, thumbnail: { text: thumbText, prompt: thumbnail },
      seo: { title: seoTitle, description: description, tags: tags },
      star: { date: starLong, score: star.score, hits: star.hits }, usedHidden: D.usedHidden
    };
    plan.checks = lint(plan);
    return plan;
  }

  /* ------------------------------------------------------------- checks -- */
  function lint(plan) {
    var out = { banned: [], shortOrLong: [], tagMissing: [], repeatedShots: [], etymology: 0, today: 0, endsWithCta: false, wordsInRange: false, paragraphsInRange: false, ok: false };
    plan.script.forEach(function (p) {
      var low = p.text.toLowerCase();
      BANNED_NARRATION.forEach(function (b) { if (low.indexOf(b) >= 0) out.banned.push("§" + p.n + ": " + b); });
      if (p.words < 15 || p.words > 40) out.shortOrLong.push("§" + p.n + ": " + p.words + " words");
      p.kind.split("+").forEach(function (k) { if (k === "etymology") out.etymology++; if (k === "today") out.today++; });
    });
    var visual = new RegExp("\\b(" + BANNED_VISUAL.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")\\b", "i");
    function scan(label, text, strip) {
      strip.forEach(function (s) { text = text.split(s).join(" "); });
      var m = visual.exec(text);
      if (m) out.banned.push(label + ": " + m[1]);
    }
    var prev = null;
    plan.imagePrompts.forEach(function (im) {
      if (im.prompt.slice(-STYLE_TAG.length) !== STYLE_TAG) out.tagMissing.push("image " + im.n);
      if (im.shot === prev) out.repeatedShots.push("image " + im.n);
      prev = im.shot;
      scan("image " + im.n, im.prompt, [STYLE_TAG]);
    });
    plan.clipPrompts.forEach(function (c) { scan("clip " + c.n, c.prompt, [CLIP_SUFFIX]); });
    scan("thumbnail", plan.thumbnail.prompt, [STYLE_TAG]);
    var last = plan.script[plan.script.length - 1];
    out.endsWithCta = !!last && last.text.slice(-CTA.length) === CTA;
    out.wordsInRange = plan.words >= plan.wordRange[0] && plan.words <= plan.wordRange[1];
    out.paragraphsInRange = plan.paragraphs >= plan.paragraphRange[0] && plan.paragraphs <= plan.paragraphRange[1];
    out.ok = !out.banned.length && !out.shortOrLong.length && !out.tagMissing.length && !out.repeatedShots.length && out.etymology >= 3 && out.today >= 3 && out.endsWithCta && out.wordsInRange && out.paragraphsInRange && plan.seo.title.length < 60 && plan.seo.tags.length >= 15 && plan.seo.tags.length <= 20;
    return out;
  }

  /* -------------------------------------------------------------- text -- */
  function scriptText(plan) { return plan.script.map(function (p) { return "§" + p.n + " " + p.text; }).join("\n\n") + "\n"; }
  function batchesOf(list) { var out = []; for (var i = 0; i < list.length; i += 5) out.push(list.slice(i, i + 5)); return out; }
  function imageBlock(plan, im) {
    return "IMAGE " + im.n + " — for Script §" + im.paragraph + "\n\nScript Line: “" + plan.script[im.paragraph - 1].text + "”\n\nImage Prompt: “" + im.prompt + "”\n\nAspect Ratio: 16:9 Horizontal";
  }
  function clipBlock(plan, c) {
    return "VIDEO CLIP " + c.n + " — from Image " + c.image + "\n\nNarration during this clip: “" + plan.script[c.n - 1].text + "”\n\nSeedance Animation Prompt: “" + c.prompt + "”\n\nDuration: " + c.seconds + " seconds · Model: Seedance 2.5 · Aspect Ratio: 16:9";
  }
  function planLines(plan) {
    return [
      "📏 VIDEO LENGTH: " + plan.length + " minutes (" + plan.seconds + " seconds)",
      "📝 SCRIPT: " + num(plan.words) + " words (at 160–175 words per minute; the brief asks " + num(plan.wordRange[0]) + "–" + num(plan.wordRange[1]) + ")",
      "📸 TOTAL IMAGES NEEDED: " + plan.images,
      "📦 IMAGE BATCHES: " + plan.batches + " rounds (5 images per round)",
      "🎬 TOTAL VIDEO CLIPS: " + plan.clips,
      "⏱️ EACH VIDEO CLIP: 5–10 seconds",
      "🖼️ THUMBNAIL: 1 image",
      "📋 SEO PACKAGE: Title + Description + Tags"
    ];
  }
  function checkLines(plan) {
    var k = plan.checks;
    return [
      num(plan.words) + " words in " + plan.paragraphs + " paragraphs" + (k.wordsInRange && k.paragraphsInRange ? ", within the brief" : ", outside the brief") + "; every paragraph 15–40 words: " + (k.shortOrLong.length ? "no (" + k.shortOrLong.join(", ") + ")" : "yes"),
      "Etymology drops: " + k.etymology + " · “still exists today” anchors: " + k.today + " · closes with the call to subscribe: " + (k.endsWithCta ? "yes" : "no"),
      "Banned phrases and banned visual words: " + (k.banned.length ? k.banned.join("; ") : "none"),
      "Style tag on every image: " + (k.tagMissing.length ? "missing on " + k.tagMissing.join(", ") : "yes") + " · no shot type repeated twice running: " + (k.repeatedShots.length ? "no (" + k.repeatedShots.join(", ") + ")" : "yes")
    ];
  }
  function toMarkdown(plan) {
    var L = [];
    L.push("# " + plan.seo.title + " — production package");
    L.push("");
    L.push("_Written by Natorion Studio from the event “" + plan.eventName + "” on " + plan.generatedOn + " · " + plan.length + "-minute cut · " + plan.eraName + " palette · variation " + plan.variation + "_");
    L.push("");
    L.push("> The chronology is the Archaix thesis of Jason Breshears, presented as a study and worldbuilding instrument, not as established history. The chronicler on screen is a dramatization; the dates, day-counts, scores and calendar readings are the Cipher's and the Chronicon's, as computed.");
    L.push("");
    L.push("## Production plan");
    L.push("");
    planLines(plan).forEach(function (l) { L.push(l + "  "); });
    L.push("");
    L.push("Sections: " + plan.sections.map(function (s) { return s.at + " " + s.name + " (" + s.words + " words)"; }).join(" · "));
    L.push("");
    L.push("## Voiceover script");
    L.push("");
    L.push("Only the spoken narration. Every paragraph is one scene.");
    L.push("");
    plan.script.forEach(function (p) { L.push("§" + p.n + " " + p.text); L.push(""); });
    L.push("## Character look cards");
    L.push("");
    plan.cast.forEach(function (c) { L.push(c.name + " — Look Card: “" + c.card + "”"); L.push(""); });
    L.push("## Image prompts");
    L.push("");
    batchesOf(plan.imagePrompts).forEach(function (batch, i) {
      L.push("### Batch " + (i + 1) + " of " + plan.batches);
      L.push("");
      batch.forEach(function (im) { L.push("---"); L.push(""); L.push(imageBlock(plan, im)); L.push(""); });
    });
    L.push("## Video animation prompts");
    L.push("");
    batchesOf(plan.clipPrompts).forEach(function (batch, i) {
      L.push("### Batch " + (i + 1) + " of " + plan.batches);
      L.push("");
      batch.forEach(function (c) { L.push("---"); L.push(""); L.push(clipBlock(plan, c)); L.push(""); });
    });
    L.push("## Thumbnail");
    L.push("");
    L.push("Bold text: “" + plan.thumbnail.text + "”");
    L.push("");
    L.push("Thumbnail Prompt: “" + plan.thumbnail.prompt + "”");
    L.push("");
    L.push("## Title, description and tags");
    L.push("");
    L.push("FINAL TITLE: " + plan.seo.title);
    L.push("");
    L.push("DESCRIPTION:");
    L.push("");
    L.push(plan.seo.description);
    L.push("");
    L.push("TAGS (" + plan.seo.tags.length + "): " + plan.seo.tags.join(", "));
    L.push("");
    L.push("## Checks");
    L.push("");
    checkLines(plan).forEach(function (l) { L.push("- " + l); });
    L.push("");
    L.push("_Seed the dates · cast the numbers · read what survives — read, cast, seed._");
    L.push("");
    return L.join("\n");
  }

  NC.studio = {
    LENGTHS: LENGTHS, STYLE_TAG: STYLE_TAG, CLIP_SUFFIX: CLIP_SUFFIX, CTA: CTA, SHOTS: SHOTS, ERAS: ERAS, ERA_KEYS: ERA_KEYS, WPM: WPM,
    words: words, compareDays: compareDays, describeEquation: describeEquation,
    build: build, lint: lint, scriptText: scriptText, toMarkdown: toMarkdown, imageBlock: imageBlock, clipBlock: clipBlock, planLines: planLines, checkLines: checkLines, batchesOf: batchesOf
  };
})(typeof window !== "undefined" ? window : globalThis);
