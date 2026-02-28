const NIGHT_KILL_MESSAGES = [
  "As dawn breaks, the town discovers {name} lying motionless in the square. The Mafia's shadow has claimed another soul.",
  "The morning bell tolls for {name}. Found at the edge of town, their fate sealed in the dark of night.",
  "{name} will not be joining breakfast today. The Mafia made sure of that.",
  "A scream at first light reveals the worst: {name} has been taken by the Mafia's cruel hand.",
  "The dew on the grass is tinged with sorrow. {name} was found, a victim of the night's dark dealings.",
  "Silence hangs over {name}'s empty chair. The Mafia has struck again under cover of darkness.",
  "The rooster crows, but {name} will never hear it again. Another life lost to the Mafia's reign of terror.",
  "{name} sleeps now, and will sleep forever. The night was not kind.",
];

const DOCTOR_SAVE_MESSAGES = [
  "A miracle! {name} was found barely breathing at dawn, nursed back to health by mysterious hands. The Doctor's vigil saved a life tonight.",
  "The Mafia came for {name}, but someone was watching. The Doctor's intervention kept death at bay.",
  "Against all odds, {name} survived the night. Whispers of a guardian angel spread through town.",
  "{name} wakes with a start, unaware how close death came. The Doctor's steady hands turned fate aside.",
];

const NO_KILL_MESSAGES = [
  "The town wakes to an unusual calm. Everyone is alive. Perhaps the night was kinder than expected.",
  "Dawn arrives peacefully. No blood was spilled. The town breathes a collective sigh of relief.",
  "A quiet night passes without incident. Every soul accounted for, every heart still beating.",
];

const EXECUTION_MESSAGES = [
  "The town has spoken. {name} is led away, the verdict final. Justice — or perhaps injustice — is served.",
  "By a show of hands, {name}'s fate is sealed. The gallows await.",
  "Democracy is harsh. {name} is voted out, cast from the living by the will of the people.",
  "The crowd's verdict echoes: {name} must go. There is no appeal.",
  "{name} stands before the town one final time. The majority has spoken, and their word is law.",
];

const EXECUTION_SPARED_MESSAGES = [
  "The vote falls short. {name} lives to see another night — for now.",
  "Not enough hands are raised. {name} is spared, though suspicion lingers like smoke.",
  "The town hesitates. {name} escapes the gallows today, but tomorrow is another story.",
];

const LOVER_DEATH_MESSAGES = [
  "But fate is not finished. Bound by an invisible thread, {name} collapses — their heart shattered by the loss of a love they never knew they had. The star-crossed lovers are united in death.",
  "And then, a gasp. {name} clutches their chest and falls. The lovers' bond, forged in secret, is severed only by sharing the same end.",
  "Tragedy strikes twice. {name}, linked by destiny to the fallen, succumbs to a grief beyond words. Two lovers, anonymous to each other, now share the same eternal silence.",
  "As {lover} falls, so too does {name}. An unseen bond, an unspoken love — both extinguished in a single cruel stroke of fate.",
];

const JOKER_WIN_MESSAGES = [
  "PLOT TWIST! {name} throws back their head and laughs. The Joker has been executed — and that's exactly what they wanted. The Joker wins! Everyone else? Not so much.",
  "The crowd cheers... then freezes. {name} reveals the Joker card with a wicked grin. By executing the Joker, the town and the Mafia have both lost. Chaos reigns!",
  "Wait — something's wrong. {name} is LAUGHING. The Joker has played everyone. Executed by the town, victorious in madness. The Joker wins alone!",
];

const TOWN_WIN_MESSAGES = [
  "The last Mafia member falls. The town erupts in relief — the nightmare is over. The Citizens win!",
  "Justice prevails! Every Mafia member has been found and eliminated. The town is safe once more. Citizens win!",
  "The shadow over the town lifts. With every Mafia member gone, peace returns at last. Victory for the Citizens!",
];

const MAFIA_WIN_MESSAGES = [
  "The town falls silent. The Mafia now outnumbers the innocent. Darkness descends — the Mafia wins!",
  "It's too late. The Mafia has grown too powerful, their numbers matching the townsfolk. The Mafia wins!",
  "The citizens look around and realize the awful truth: they are outmatched. The Mafia claims victory!",
];

const NIGHT_FALLS_MESSAGES = [
  "The sun sets and shadows creep across the town. Night has fallen. Lock your doors...",
  "Darkness descends. The town sleeps, but not everyone rests peacefully. The night is full of whispers.",
  "Night falls like a curtain. Somewhere in the dark, plans are being made...",
  "The last light fades. Another night begins, and with it, the Mafia stirs.",
];

const DAY_BREAKS_MESSAGES = [
  "The first rays of sunlight pierce the darkness. A new day dawns...",
  "Morning comes, but what horrors does it reveal?",
  "The sun rises on another day. But is everyone still here to see it?",
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
    return fill(pick(NIGHT_KILL_MESSAGES), { name });
  },
  doctorSave(name: string): string {
    return fill(pick(DOCTOR_SAVE_MESSAGES), { name });
  },
  noKill(): string {
    return pick(NO_KILL_MESSAGES);
  },
  execution(name: string): string {
    return fill(pick(EXECUTION_MESSAGES), { name });
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
