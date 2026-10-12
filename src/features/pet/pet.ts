export type PetState = "healthy" | "hungry" | "stasis";

export const TICK_DURATION = 100;

export const PET_HUNGER_RATE_PER_TICK = 1;
export const PET_HUNGER_THRESHOLD = 75;
export const PET_HUNGER_LIMIT = 1000;

export const PET_FEEDING_COOLDOWN = 1000;

export const ErrorMessage = {
  STASIS: "Can't feed a pet as it is in stasis",
  NOT_HUNGRY: "Can't feed a pet as it is not hungry",
  JUST_FED: `Pet can't be fed more often than once in ${PET_FEEDING_COOLDOWN / 1000}s`,
} as const;

export class StasisError extends Error { }
export class NotHungryError extends Error { }
export class JustFedError extends Error { }

export default class Pet {
  constructor() {
    const now = Date.now();
    this.#createdAt = now;
    this.#timer = setInterval(() => this.#tick(), TICK_DURATION);
  }

  #createdAt: number = -1
  #hunger: number = 0
  #lastFed: number = -1
  #timer:ReturnType<typeof setInterval>

  get age() {
    const ms = Date.now() - this.#createdAt;
    const days = ms / 1000 / 60 / 60 / 24;
    return Math.floor(days);
  }

  get _hunger() {
    return this.#hunger;
  }

  get state(): PetState {
    if (this.#hunger === PET_HUNGER_LIMIT) {
      return "stasis";
    }

    if (this.#hunger >= PET_HUNGER_THRESHOLD) {
      return "hungry";
    }

    return "healthy";
  }

  #tick() {
    this.#hunger = Math.min(this.#hunger + PET_HUNGER_RATE_PER_TICK, PET_HUNGER_LIMIT);
  }

  feed() {
    if (this.state === "stasis") {
      throw new StasisError(ErrorMessage.STASIS);
    }

    if (this.#lastFed !== -1 && Date.now() - this.#lastFed < PET_FEEDING_COOLDOWN) {
      throw new JustFedError(ErrorMessage.JUST_FED);
    }

    if (this.#hunger < PET_HUNGER_LIMIT / 10) {
      throw new NotHungryError(ErrorMessage.NOT_HUNGRY);
    }

    this.#lastFed = Date.now();
    this.#hunger -= PET_HUNGER_LIMIT / 10;
  }

  dispose() {
    clearInterval(this.#timer);
  }
}
