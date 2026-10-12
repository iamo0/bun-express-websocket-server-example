import { Router, type Response } from "express";
import Pet, { JustFedError, NotHungryError, StasisError, type PetState } from "./pet";

interface PetStateResponse {
  state: PetState,
}

export enum PetContextMessage {
  FED = "Someone fed the pet",
  NOT_HUNGRY = "Someone tried to feed the pet when it wasn't hungry",
  JUST_FED = "Someone tried to feed the pet right after it was fed by someone else",
  STASIS = "Someone tried to feed pet while it's in stasis",
}

export default function initPetContext(broadcastFn: (message: string) => void = () => { }) {
  const pet = new Pet();
  const router = Router({ mergeParams: true });

  router.get("/state", function (_req, res: Response<PetStateResponse>) {
    const { state } = pet;
    res.status(200).json({
      state,
    });
  });

  router.get("/feed", function (_req, res: Response) {
    let broadcastMessage: PetContextMessage | null = null;

    try {
      pet.feed();
      res.status(200).json({
        state: pet.state,
      });
      broadcastMessage = PetContextMessage.FED;
    } catch (err) {
      if (err instanceof StasisError || err instanceof JustFedError || err instanceof NotHungryError) {
        const status = err instanceof JustFedError ? 429 : 409;
        res.status(status).json({
          message: err.message,
        });

        if (err instanceof StasisError) {
          broadcastMessage = PetContextMessage.STASIS;
        } else if (err instanceof JustFedError) {
          broadcastMessage = PetContextMessage.JUST_FED;
        } else if (err instanceof NotHungryError) {
          broadcastMessage = PetContextMessage.NOT_HUNGRY;
        } else {
          throw new Error("Unknown error");
        }
      }
    } finally {
      broadcastFn(broadcastMessage!);
    }
  })

  return {
    router,
    dispose() {
      pet.dispose();
    }
  };
}
