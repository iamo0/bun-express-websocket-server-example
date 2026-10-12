import path from "node:path";
import express from "express";

export default function getFrontendContext() {
  return {
    middleware: express.static(path.join(import.meta.dir, "../../..", "public")),
  };
}
