// Load .env from the repo root (where the README says to put it), then server/.env if present.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: [path.resolve(here, "../../.env"), path.resolve(here, "../.env")], quiet: true });
