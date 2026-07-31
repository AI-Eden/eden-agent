import { cp, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
export async function prepareImageBuildContext(destination) {
  await mkdir(destination, { mode: 0o700 });
  if ((await readdir(destination)).length !== 0) throw new Error("image_context_not_empty");
  await Promise.all(
    ["Dockerfile", "wrapper.mjs"].map((name) =>
      cp(join(sourceDirectory, name), join(destination, name), {
        errorOnExist: true,
        force: false,
      }),
    ),
  );
}
