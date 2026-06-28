// Mad-libs random elements
const FOODS = [
  "a cold cup of coffee", "a half-eaten supper", "a loaf of bread gone stale",
  "a bottle with one swallow left", "a plate of food long since cold",
  "a slice of pie nobody finished", "a candle burned down to nothing",
  "a hand of cards", "a folded newspaper", "an unsmoked cigarette",
  "a glass of whiskey, untouched", "a single match",
];

const LOCATIONS = [
  "in the alley behind the tailor's", "at the foot of the harbor stairs",
  "in a doorway off the empty square", "under the dead streetlamp on Mercer Lane",
  "by the fountain, face to the cobblestones", "on the landing of the old tenement",
  "in the back room of the shuttered bar", "beneath the railway bridge",
  "in the fog at the end of the pier", "by the loading dock, out of the light",
  "in the stairwell of the boarding house", "at the corner where the gaslight had gone out",
];

const TOOLS = [
  "a knife, clean and quiet", "a length of wire", "a single shot, close range",
  "something heavy and blunt", "a cord drawn tight", "a blade between the ribs",
  "a pistol, the kind that doesn't echo", "an iron pipe",
  "poison, slow and patient", "a straight razor", "a blow to the back of the head",
  "their own scarf, used against them",
];

const LAST_WORDS = [
  '"I should have left this town when I had the chance..."',
  '"Tell them... it wasn\'t me..."',
  '"I knew it would end like this..."',
  '"You won\'t get away with..."',
  '"The ledger... look in the ledger..."',
  '"It was supposed to be a quiet night..."',
  '"I never saw their face..."',
  '"So that\'s how it is..."',
  '"Cold... it\'s so cold..."',
  '"Don\'t trust..."',
  '"I should have run..."',
  '"Lock the door behind me..."',
];

const SAVE_METHODS = [
  "a steady hand and a needle and thread", "pressure held until the bleeding stopped",
  "a doctor who answered the door at this hour", "the right words and the wrong amount of luck",
  "a man who knew where the bullet had to come out", "cold water and a colder nerve",
  "the kind of medicine that asks no questions", "a heartbeat coaxed back from the edge",
  "stubbornness, mostly, and a clean bandage", "the only hand in town that doesn't shake",
];

const JOKER_HAUNT_KILL_MESSAGES = [
  "{name} was found at dawn, cold and grinning. A playing card sat on their chest — the Joker. {lastWords}",
  "{name} did not see morning. Discovered {location}, a single card tucked into their coat. The Joker collects, even now.",
  "{name} didn't survive the night. Those who passed the window swear they heard laughing {location}. No one was there.",
  "The town wakes to find {name} {location}. A card pinned to the door, the lamp still burning. {lastWords}",
  "{name} is gone. Found {location}, clutching {food}, a Joker card in the other hand. The dead keep their promises.",
  "A cold settles over the street. {name} was found {location}, no sign of struggle, no sign of anyone. The Joker pays its debts.",
  "{name} lies {location}. The murder weapon? {tool}. The signature? A single card. The Joker laughs from somewhere you can't follow.",
  "It's a grim morning. {name} was discovered {location}, a Joker card weighing down their hand. {lastWords}",
];

const EXECUTION_STYLES = [
  "taken to the gallows at first light", "led from the square and not seen again",
  "marched out past the silent crowd", "given to the rope as the town watched",
  "walked to the edge of town and left there", "put down by the verdict of the room",
  "handed over to the dark beyond the lamplight", "carried out, the matter closed",
];

const NIGHT_KILL_MESSAGES = [
  "{name} was found {location}, taken out with {tool}. Their last words: {lastWords}",
  "{name} did not see the morning. Discovered {location}, clutching {food}. No one heard a thing.",
  "{name} is dead. Found {location}, with evidence of {tool} near the body. {lastWords}",
  "{name} didn't survive the night. Last seen {location}, eating {food}. The door was locked from the inside.",
  "The town wakes to find {name} {location}. Cause of death: {tool}. {lastWords}",
  "{name} is gone. The signs point to {tool} near {location}. They died holding {food}.",
  "{name} was found {location}. The murder weapon? {tool}. On the table beside them, {food}, left uneaten.",
  "It's a grim morning. {name} was discovered {location}, done in by {tool}. {lastWords}",
];

const VIGILANTE_KILL_MESSAGES = [
  "A single gunshot rang out in the dark. {name} did not see the dawn. {lastWords}",
  "The Vigilante's lone bullet found {name} {location}. One shot, no echo.",
  "{name} was gunned down in the night, {location}. Someone in this town keeps a pistol and their own counsel.",
  "{name} is dead — a clean shot, close range, no killer to be found. The Vigilante answers to no one.",
  "It's a grim morning. {name} was discovered {location}, a single bullet and no witnesses. {lastWords}",
];

const DOCTOR_SAVE_MESSAGES = [
  "{name} was found barely breathing {location}, kept alive by {saveMethod}. The Doctor got there first.",
  "{name} should be dead. Instead they're sitting up, pale and shaking, pulled back by {saveMethod}.",
  "They came for {name} in the dark. The Doctor was already there, working by lamplight with {saveMethod}.",
  "{name} survived the night by inches, owed entirely to {saveMethod}. Death will have to wait.",
  "{name} was on the edge of it {location}. {saveMethod} was enough — just enough — to bring them back.",
];

// Official mode: narrator hints someone survived but doesn't name who
const DOCTOR_SAVE_OFFICIAL_MESSAGES = [
  "Someone was meant to die last night. A hand intervened in the dark, and they didn't. No name was left.",
  "There was a target. There was blood on the cobblestones. And then there was a survivor. That's all anyone knows.",
  "The killers' work was undone before dawn. One they marked still draws breath. Who, and by whose hand, stays a secret.",
  "A life held on by a thread last night, and someone tied it off. The Doctor keeps quiet hours.",
  "The night was not clean, but it took no one. Someone lives who shouldn't. Ask no questions.",
];

// Private message sent to the victim in official mode
const DOCTOR_SAVE_VICTIM_MESSAGES = [
  "They marked you last night. You're alive because someone reached you first. Say nothing, and watch the doors.",
  "A knife had your name on it in the dark. It found someone steadier instead. You survived. Keep it to yourself.",
  "You were meant to be the body at dawn. You aren't. Count yourself lucky, and stay out of the light.",
];

const NO_KILL_MESSAGES = [
  "Dawn comes, and no one is missing. The knives stayed in their sheaths tonight. No one says why.",
  "Morning, and every door opens to a living face. Whatever was planned, it didn't happen. Not this time.",
  "The town wakes whole. No blood, no body, no answer. The quiet feels like it's waiting for something.",
  "A night passed and took nothing with it. The fog lifts on a street with all its people still on it.",
];

const EXECUTION_MESSAGES = [
  "The town has spoken. {name} is {executionStyle}. Whether it was justice, no one will ever be sure.",
  "The vote is counted. {name}'s fate is sealed. They are {executionStyle}.",
  "The room decides, and the decision is final. {name} has been {executionStyle}.",
  "The verdict comes down hard. {name} must go, and so {name} is {executionStyle}.",
  "{name} stands before the town one last time. The hands are raised, the matter settled. {name} is {executionStyle}.",
];

const EXECUTION_SPARED_MESSAGES = [
  "The vote falls short. {name} walks free into another night, and watches their back the whole way.",
  "Not enough hands went up. {name} is spared, though no one in the room has stopped watching them.",
  "The town hesitates, and the moment passes. {name} lives. The suspicion does not go away.",
  "The verdict won't hold. {name} survives the vote. The town will remember whose name came up.",
];

const LOVER_DEATH_MESSAGES = [
  "Then {name} goes still too. They were {lover}'s, in secret, and a heart only breaks the once. Two coats left on two chairs.",
  "{name} falls a breath after {lover} does. The thread between them was real, and it pulled tight at the end. Now there are two graves to dig.",
  "{name} doesn't outlive {lover} by a minute. Whatever bound them, it held to the last. The town buries the pair together.",
  "{name} was {lover}'s lover. As {lover} dies, {name} follows, without a sound. Some debts the heart pays in full.",
];

const JOKER_WIN_MESSAGES = [
  "{name} is already smiling as the rope goes taut. They wanted this. You gave it to them, and the joke was never yours to get.",
  "The crowd quiets. {name} doesn't struggle, doesn't plead — just looks back at the room like it walked into a trap of its own making. The Joker came here to lose, and won.",
  "{name} laughs, soft and final. The whole town fell for it, killers and innocents alike. They handed the Joker the one thing it ever asked for.",
];

const TOWN_WIN_MESSAGES = [
  "The last of the Mafia falls. The street lamps come on early, and for the first time in a long time, no one is afraid to walk under them. The town wins.",
  "Every killer has been named and dealt with. The fog burns off by noon and stays gone. The town is quiet again — quiet the right way. The town wins.",
  "The shadow over the town lifts with the last of them gone. People sleep with the doors unlocked tonight, and nothing comes. The town wins.",
];

const MAFIA_WIN_MESSAGES = [
  "The town goes quiet, and stays that way. The men who run it now don't raise their voices; they don't need to. The Mafia wins.",
  "It's over. There aren't enough honest hands left to hold the line. The lamps stay dark on whichever streets they choose. The Mafia wins.",
  "The survivors look around and understand: they're outnumbered, and they always were. Nobody argues with the new order. The Mafia wins.",
];

const HUNTER_REVEAL_MESSAGES = [
  "{name} was the Hunter. With the last of their strength, they reach for the gun — and the whole room stops breathing...",
  "{name} was the Hunter. They were never going to go quietly. The weapon comes up, slow and certain...",
  "So that's what {name} was — the Hunter. The barrel rises one last time, and all at once nobody wants to be standing too close...",
  "The truth comes out at the end: {name} was the Hunter. A steady aim on an unsteady hand, one round left. The town goes very quiet...",
  "{name} was the Hunter. They aren't leaving the table alone. The hammer draws back, and the room holds still...",
];

const HUNTER_REVENGE_KILL_MESSAGES = [
  "A single shot, and {name} goes down beside the Hunter. The dying take who they please.",
  "One round leaves the chamber. {name} drops where they stood. The Hunter's aim held to the end.",
  "{name} is the Hunter's last word. The shot was clean. There is nothing to argue with now.",
  "The Hunter fires once. {name} doesn't get the chance to speak. The matter is closed for both of them.",
  "{name} falls to the Hunter's parting shot. Two bodies now where there was one. The street goes silent again.",
];

const HUNTER_DECLINE_MESSAGES = [
  "The Hunter lowers the gun. Whatever they had left, they keep it. No one else dies tonight.",
  "The Hunter looks the room over, slow, and then sets the weapon down. Mercy, or just tiredness — they don't say.",
  "No shot comes. The Hunter shoulders the gun and walks out into the fog, leaving the rest of them to wonder.",
  "The barrel drops. The Hunter goes without firing, and the town is left alone with its suspicions.",
];

const NIGHT_FALLS_MESSAGES = [
  "The sun goes down and the fog comes up to meet it. Night now. Lock your doors, and don't answer them.",
  "Darkness settles over the town. Most of it sleeps. Some of it doesn't, and has reasons not to.",
  "Night falls like a curtain drawn slow. Somewhere out past the last lamp, plans are already being made.",
  "The last light goes out of the sky. Another night begins, and the wrong people are awake for it.",
];

const DAY_BREAKS_MESSAGES = [
  "Grey light comes up over the rooftops. A new day, and the first question is who's still here to see it.",
  "Morning. The fog thins, the lamps go out one by one, and the town counts its people.",
  "The sun comes up cold on another day. Time to find out what the night took, and who.",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Single-pass substitution: every placeholder in the template is replaced in
// one scan, so substituted values (e.g. a player named "{tool}") are never
// re-expanded. Unknown placeholders are left as-is. The callback form also
// keeps `$` replacement patterns in values (e.g. a player named "$&") literal
// — do not switch to string-replacement semantics, which would interpret them.
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

export const Narrator = {
  nightKill(name: string): string {
    return fill(pick(NIGHT_KILL_MESSAGES), {
      name,
      location: pick(LOCATIONS),
      tool: pick(TOOLS),
      lastWords: pick(LAST_WORDS),
      food: pick(FOODS),
    });
  },
  doctorSave(name: string): string {
    return fill(pick(DOCTOR_SAVE_MESSAGES), {
      name,
      saveMethod: pick(SAVE_METHODS),
      location: pick(LOCATIONS),
    });
  },
  doctorSaveOfficial(): string {
    return pick(DOCTOR_SAVE_OFFICIAL_MESSAGES);
  },
  // No longer sent: official Mafia must NOT privately reveal to the saved
  // victim that they were targeted (server.ts dropped the doctor_save_private
  // send). Kept for reference / potential non-official future use.
  doctorSaveVictim(): string {
    return pick(DOCTOR_SAVE_VICTIM_MESSAGES);
  },
  noKill(): string {
    return pick(NO_KILL_MESSAGES);
  },
  execution(name: string): string {
    return fill(pick(EXECUTION_MESSAGES), {
      name,
      executionStyle: pick(EXECUTION_STYLES),
    });
  },
  executionSpared(name: string): string {
    return fill(pick(EXECUTION_SPARED_MESSAGES), { name });
  },
  loverDeath(name: string, loverName?: string): string {
    return fill(pick(LOVER_DEATH_MESSAGES), { name, lover: loverName ?? "their beloved" });
  },
  jokerWin(name: string): string {
    return fill(pick(JOKER_WIN_MESSAGES), { name });
  },
  jokerHauntKill(name: string): string {
    return fill(pick(JOKER_HAUNT_KILL_MESSAGES), {
      name,
      location: pick(LOCATIONS),
      tool: pick(TOOLS),
      lastWords: pick(LAST_WORDS),
      food: pick(FOODS),
    });
  },
  hunterReveal(name: string): string {
    return fill(pick(HUNTER_REVEAL_MESSAGES), { name });
  },
  hunterRevengeKill(name: string): string {
    return fill(pick(HUNTER_REVENGE_KILL_MESSAGES), { name });
  },
  hunterDecline(): string {
    return pick(HUNTER_DECLINE_MESSAGES);
  },
  vigilanteShotKill(name: string): string {
    return fill(pick(VIGILANTE_KILL_MESSAGES), {
      name,
      location: pick(LOCATIONS),
      lastWords: pick(LAST_WORDS),
    });
  },
  townWin(): string {
    return pick(TOWN_WIN_MESSAGES);
  },
  mafiaWin(): string {
    return pick(MAFIA_WIN_MESSAGES);
  },
  nightFalls(): string {
    return pick(NIGHT_FALLS_MESSAGES);
  },
  dayBreaks(): string {
    return pick(DAY_BREAKS_MESSAGES);
  },
};
