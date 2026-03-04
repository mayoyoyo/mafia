// Mad-libs random elements
const FOODS = [
  "a half-eaten calzone", "a suspiciously warm burrito", "a gluten-free muffin",
  "a questionable gas station sushi roll", "an entire rotisserie chicken",
  "a single olive on a toothpick", "a melted popsicle", "a soggy cereal bowl",
  "a pineapple pizza (controversial even in death)", "a stale fortune cookie",
];

const LOCATIONS = [
  "behind the town dumpster", "in the haunted Costco parking lot",
  "at the bottom of the town fountain", "inside a suspiciously large pothole",
  "tangled in the town's Christmas lights (it's July)",
  "in the drive-thru lane of a closed Wendy's", "under a pile of mismatched socks",
  "in the ball pit at Chuck E. Cheese", "on top of the town's only traffic cone",
  "halfway through the hedge maze nobody uses",
];

const TOOLS = [
  "a rubber duck and a lot of determination", "an aggressive Roomba",
  "a weaponized leaf blower", "a very judgmental cat",
  "nothing but harsh words and a firm handshake", "a comically oversized mallet",
  "a spork and sheer willpower", "a strongly worded letter",
  "a cursed IKEA instruction manual", "a banana peel strategically placed",
];

const LAST_WORDS = [
  '"Tell my WiFi... I loved her..."',
  '"I should have... cleared my browser history..."',
  '"At least I don\'t have to pay rent anymore..."',
  '"Delete... my search history..."',
  '"I knew that burrito was suspicious..."',
  '"Was it something I said...?"',
  '"My only regret... is not buying Bitcoin in 2010..."',
  '"Rosebud... wait, wrong franchise..."',
  '"I left the oven on..."',
  '"Unsubscribe..."',
];

const SAVE_METHODS = [
  "a perfectly timed Heimlich maneuver", "an emergency supply of essential oils (they actually worked this time)",
  "CPR learned entirely from a YouTube tutorial", "a conveniently placed mattress",
  "a pocket defibrillator and a prayer", "sheer stubbornness and a Red Bull",
  "a first-aid kit held together with duct tape", "a miracle smoothie recipe",
];

const EXECUTION_STYLES = [
  "catapulted into the sunset", "voted off the island (wrong show, but same energy)",
  "escorted out by an aggressive hall monitor", "yeeted into the void",
  "dramatically slow-motion walked out the door", "given a one-star Yelp review of their existence",
  "asked to leave the group chat permanently", "unfriended IRL",
];

const NIGHT_KILL_MESSAGES = [
  "{name} was found {location}, taken out with {tool}. Their last words: {lastWords}",
  "RIP {name}. Discovered {location} clutching {food}. The Mafia sends their regards.",
  "Bad news: {name} is dead. Found {location} with evidence of {tool}. {lastWords}",
  "{name} didn't survive the night. They were last seen {location} eating {food}. The Mafia strikes again.",
  "The town wakes to find {name} {location}. Cause of death: {tool}. {lastWords}",
  "{name} has been eliminated. Witnesses report seeing {tool} near {location}. They died holding {food}.",
  "Pour one out for {name}, found {location}. The murder weapon? {tool}. Their legacy? {food} left uneaten.",
  "It's a dark day. {name} was discovered {location}, done in by {tool}. {lastWords}",
];

const DOCTOR_SAVE_MESSAGES = [
  "A miracle! {name} was found barely alive {location}, saved by {saveMethod}. The Doctor pulled through!",
  "{name} cheated death tonight! The Doctor arrived just in time with {saveMethod}. They live to see another day.",
  "The Mafia came for {name}, but the Doctor intervened with {saveMethod}. Not today, death. Not today.",
  "Against all odds, {name} survived thanks to {saveMethod}. The Doctor's medical degree finally paid off.",
  "{name} was on the brink, but {saveMethod} brought them back. The Doctor deserves a raise.",
];

// Official mode: narrator hints someone survived but doesn't name who
const DOCTOR_SAVE_OFFICIAL_MESSAGES = [
  "The Mafia struck in the night, but someone was saved by a mysterious intervention. The Doctor works in silence.",
  "Someone was targeted last night, but against all odds, they survived. The details remain a mystery.",
  "The Mafia's plans were foiled — their target survived thanks to an unknown savior. No one knows who cheated death.",
  "A life was saved in the shadows last night. The Doctor's work goes unnoticed... for now.",
  "The night was not without incident, but someone lives to see another day. Who? Only the Doctor knows.",
];

// Private message sent to the victim in official mode
const DOCTOR_SAVE_VICTIM_MESSAGES = [
  "You were targeted by the Mafia last night, but the Doctor saved your life. You live to see another day.",
  "Someone tried to kill you in the night, but a mysterious savior intervened. You survived.",
  "The Mafia came for you, but you were saved. Consider yourself lucky — and watch your back.",
];

const NO_KILL_MESSAGES = [
  "The town wakes to an unusual calm. Everyone is alive. The Mafia must've had WiFi issues.",
  "Dawn arrives peacefully. No blood was spilled. Did the Mafia oversleep? Classic.",
  "A quiet night passes without incident. The Mafia apparently had better things to do, like laundry.",
  "Nobody died! The Mafia must have gotten distracted by a Netflix binge. Lucky break, everyone.",
];

const EXECUTION_MESSAGES = [
  "The town has spoken. {name} is {executionStyle}. Justice — or perhaps injustice — is served.",
  "By a show of thumbs, {name}'s fate is sealed. They have been {executionStyle}.",
  "Democracy is brutal. {name} has been {executionStyle} by the will of the people.",
  "The crowd's verdict echoes: {name} must go. They were promptly {executionStyle}.",
  "{name} stands before the town one final time. The majority has spoken, and {name} is {executionStyle}.",
];

const EXECUTION_SPARED_MESSAGES = [
  "The vote falls short. {name} lives to see another night — lucky them (for now).",
  "Not enough thumbs up (or down?). {name} is spared, though everyone's still side-eyeing them.",
  "The town hesitates. {name} escapes today, but the group chat is buzzing with theories.",
  "Plot armor activated! {name} survives the vote. The town will remember this.",
];

const LOVER_DEATH_MESSAGES = [
  "But wait — {name} clutches their chest and collapses! Turns out they were {lover}'s secret lover. Star-crossed and absolutely wrecked.",
  "Tragedy strikes twice. {name}, bound to {lover} by the invisible thread of fate (and questionable matchmaking), falls dead. Romeo and Juliet, eat your hearts out.",
  "And then, a gasp. {name} drops like a sack of potatoes — their heart literally broken by {lover}'s demise. The lovers' bond was real, and now both are really dead.",
  "PLOT TWIST: {name} was {lover}'s lover! As {lover} falls, so does {name}. The universe said 'two for one special on tragedy today.'",
];

const JOKER_WIN_MESSAGES = [
  "PLOT TWIST! {name} throws back their head and CACKLES. You fools! You absolute buffoons! The Joker WANTED to be executed! Congratulations, you all played yourselves.",
  "The crowd cheers... then freezes. {name} whips out a Joker card, does a little dance, and moonwalks into victory. Everyone else? Clowns. Actual clowns.",
  "Wait — {name} is LAUGHING?! The Joker has bamboozled the entire town AND the Mafia. By executing them, you gave them exactly what they wanted. Slow clap for everyone.",
];

const TOWN_WIN_MESSAGES = [
  "The last Mafia member falls. The town erupts in celebration — someone brought confetti! The Citizens win! Time for a pizza party.",
  "Justice prevails! Every Mafia member has been found and eliminated. The town is safe once more. Citizens win! Group hug, everyone!",
  "The shadow over the town lifts. With every Mafia member gone, peace returns at last. Victory for the Citizens! Now who left the fridge open?",
];

const MAFIA_WIN_MESSAGES = [
  "The town falls silent. The Mafia now runs this place. Everyone gets a horse head pillow. The Mafia wins!",
  "It's over. The Mafia has grown too powerful, and honestly, their outfits are way better. The Mafia wins!",
  "The citizens look around and realize they're outnumbered. The Mafia claims victory and immediately raises HOA fees!",
];

const NIGHT_FALLS_MESSAGES = [
  "The sun sets and shadows creep across the town. Night has fallen. Lock your doors... and maybe your fridge.",
  "Darkness descends. The town sleeps, but not everyone rests peacefully. Someone is definitely up to no good.",
  "Night falls like a curtain. Somewhere in the dark, plans are being made and snacks are being eaten...",
  "The last light fades. Another night begins, and with it, the Mafia stirs. Everyone else? Anxiety stirs.",
];

const DAY_BREAKS_MESSAGES = [
  "The first rays of sunlight pierce the darkness. A new day dawns... but at what cost?",
  "Morning comes. The rooster crows. The coffee is strong. But is everyone still here to drink it?",
  "The sun rises on another day. Time to find out who survived and who... didn't make the cut.",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
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
    // Used in event history — narrator doesn't distinguish haunt from mafia at dawn
    return fill(pick(NIGHT_KILL_MESSAGES), {
      name,
      location: pick(LOCATIONS),
      tool: pick(TOOLS),
      lastWords: pick(LAST_WORDS),
      food: pick(FOODS),
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
