import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mock } from "node:test";
import Pet, { JustFedError, NotHungryError, PET_HUNGER_LIMIT, PET_HUNGER_RATE_PER_TICK, PET_HUNGER_THRESHOLD, StasisError, TICK_DURATION } from "./pet";

beforeEach(function() {
  mock.timers.enable({ apis: ["setInterval", "Date"] });
});

afterEach(function() {
  mock.timers.reset();
})

describe("Pet is aging", function () {
  describe("Age is displayed in full days", function () {
    it("Newborn pet is 0 days old", function () {
      const pet = new Pet();
      expect(pet.age).toBe(0);
    });

    it("Less than 24 hours doesn't add a day", function () {
      mock.timers.setTime(new Date("2020-01-01T00:00:00.000Z").getTime());
      const pet = new Pet();
      mock.timers.setTime(new Date("2020-01-01T23:59:59.999Z").getTime());
      expect(pet.age).toBe(0);
    });

    it("One day is full 24 hours", function () {
      mock.timers.setTime(new Date("2020-01-01T00:00:00.000Z").getTime());
      const pet = new Pet();
      mock.timers.setTime(new Date("2020-01-02T00:00:00.000Z").getTime());
      expect(pet.age).toBe(1);
    });
  });
});

describe("Pet is getting hungry", function () {
  it("Newborn pet hunger level is 0", function () {
    const pet = new Pet();
    expect(pet._hunger).toBe(0);
  });

  it("Every second pet is getting hungrier at a certain rate (specified in a constant)", function () {
    const pet = new Pet();
    mock.timers.tick(TICK_DURATION);
    expect(pet._hunger).toBe(PET_HUNGER_RATE_PER_TICK);
  });

  it("Pet can't get pass certain points of hunger (specified in a constant)", function () {
    const pet = new Pet();

    mock.timers.tick(PET_HUNGER_LIMIT / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
    expect(pet._hunger).toBe(PET_HUNGER_LIMIT);

    mock.timers.tick(PET_HUNGER_LIMIT / PET_HUNGER_RATE_PER_TICK * TICK_DURATION * 2);
    expect(pet._hunger).toBe(PET_HUNGER_LIMIT);
  });
});

describe("Pet state getter", function () {
  it("If hunger points is less than PET_HUNGER_THRESHOLD pet is healthy", function () {
    const pet = new Pet();
    expect(pet.state).toBe("healthy");
  });

  it("If hunger points passed threshold (including threshold), pet is hungry", function () {
    const pet = new Pet();
    mock.timers.tick(PET_HUNGER_THRESHOLD / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
    expect(pet.state).toBe("hungry");
  });

  it("If hunger points maxed, pet goes to stasis", function () {
    const pet = new Pet();
    mock.timers.tick(PET_HUNGER_LIMIT / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
    expect(pet.state).toBe("stasis");
  });
});

describe("Pet feeding process", function() {
  it("You can't feed a pet that is in stasis", function() {
    const pet = new Pet();
    mock.timers.tick(PET_HUNGER_LIMIT / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
    expect(pet.state).toBe("stasis");
    expect(() => pet.feed()).toThrow(StasisError);
  });

  it("If a pet is fully fed (hunger is less than 1/10 of hunger limit) it doesn't eat", function() {
    const pet = new Pet();
    expect(() => pet.feed()).toThrow(NotHungryError);

    mock.timers.tick((PET_HUNGER_LIMIT / 10) / PET_HUNGER_RATE_PER_TICK * TICK_DURATION - 1);
    expect(() => pet.feed()).toThrow(NotHungryError);

    mock.timers.tick(1);
    expect(() => pet.feed()).not.toThrow();
  });

  it("Pet can't be fed more often than once in a certain time (specified in a constant)", function() {
    const pet = new Pet();

    mock.timers.tick((PET_HUNGER_LIMIT / 10) / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
    expect(() => pet.feed()).not.toThrow();

    mock.timers.tick(1);
    expect(() => pet.feed()).toThrow(JustFedError);
  });

  it("Pet feeding decreases its hunger rate by 1/10 of total hunger limit", function() {
    const pet = new Pet();
    const start = PET_HUNGER_LIMIT / 10 + 50;
    mock.timers.tick(start / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
    pet.feed();
    expect(pet._hunger).toBe(start - PET_HUNGER_LIMIT / 10);
  });

  it("JustFed takes precedence over NotHungry", () => {
    const pet = new Pet();
    mock.timers.tick(PET_HUNGER_LIMIT / 10 / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
    pet.feed();
    mock.timers.tick(1);
    expect(() => pet.feed()).toThrow(JustFedError);
  });
});

describe("Pet disposal", function() {
  it("Pet.dispose() stops the timer", function() {
    const pet = new Pet();
    mock.timers.tick(PET_HUNGER_LIMIT / 10 / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
    expect(pet._hunger).toBe(PET_HUNGER_LIMIT / 10);

    pet.dispose();

    mock.timers.tick(1000);
    expect(pet._hunger).toBe(PET_HUNGER_LIMIT / 10);
  });
});
