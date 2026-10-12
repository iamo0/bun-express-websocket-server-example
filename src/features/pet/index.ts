import { Router, type Response } from "express";
import Pet, { ErrorMessage, JustFedError, NotHungryError, StasisError, type PetState } from "./pet";

interface PetStateResponse {
  state: PetState,
}

export default function initPetContext() {
  const pet = new Pet();
  const router = Router({ mergeParams: true });

  router.get("/state", function (_req, res: Response<PetStateResponse>) {
    const { state } = pet;
    res.status(200).json({
      state,
    });
  });

  router.get("/feed", function (_req, res: Response) {
    try {
      pet.feed();
      res.sendStatus(204);
    } catch (err) {
      if (err instanceof StasisError || err instanceof JustFedError || err instanceof NotHungryError) {
        const status = err instanceof JustFedError ? 429 : 409;
        res.status(status).json({
          message: err.message,
        });
        return;
      }
      // TODO: Common error handling
    }
  })

  return {
    router,
    dispose() {
      pet.dispose();
    }
  };
}
