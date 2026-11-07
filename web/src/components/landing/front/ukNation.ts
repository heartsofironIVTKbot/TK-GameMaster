// The United Kingdom in vanilla 1936, as the map's nation panel shows it
// (copied from src/data/scenarios/vanilla_1936.json, so the front page
// doesn't load every scenario). Regenerate if that data changes.
export const UK_1936 = {
  "tag": "ENG",
  "name": "United Kingdom",
  "flagUrl": "/assets/flags/ENG.png",
  "leader": {
    "name": "Stanley Baldwin",
    "portraitUrl": "/assets/portraits/ENG.png"
  },
  "ideology": {
    "breakdown": {
      "communism": 1,
      "democratic": 97,
      "fascism": 2,
      "nonAligned": 0
    },
    "name": "Democracy",
    "rulingPartyShare": 97
  },
  "stability": 89,
  "warSupport": 15,
  "spirits": [
    {
      "id": "MTG_naval_treaty_adherent",
      "name": "London Naval Treaty Signatory",
      "iconUrl": "/assets/spirits/MTG_naval_treaty_adherent.png"
    },
    {
      "id": "stiff_upper_lip",
      "name": "British Stoicism",
      "iconUrl": "/assets/spirits/stiff_upper_lip.png"
    },
    {
      "id": "ENG_the_war_to_end_all_wars",
      "name": "The War to End All Wars",
      "iconUrl": "/assets/spirits/ENG_the_war_to_end_all_wars.png"
    },
    {
      "id": "george_v",
      "name": "King George V",
      "iconUrl": "/assets/spirits/george_v.png"
    }
  ],
  "industry": {
    "civilianFactories": 32,
    "militaryFactories": 14,
    "navalDockyards": 19
  },
  "resources": {
    "aluminum": 114,
    "chromium": 156,
    "coal": 343,
    "oil": 23,
    "rubber": 87,
    "steel": 412,
    "tungsten": 89
  },
  "armedForces": {
    "divisions": 36,
    "fieldManpower": 202500,
    "totalAircraft": 1346,
    "totalWarships": 239
  }
} as const;
