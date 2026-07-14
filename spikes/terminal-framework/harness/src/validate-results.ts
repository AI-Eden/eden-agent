import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateMeasurementRecord } from "./measurement-schema.ts";

class ResultValidationError extends Error {
  readonly name = "ResultValidationError";
}

async function main(): Promise<void> {
  const directoryArgument = process.argv[2];
  if (directoryArgument === undefined) {
    throw new ResultValidationError("Usage: validate-results.ts <results-directory>");
  }
  const directory = resolve(directoryArgument);
  const filenames = (await readdir(directory)).filter((filename) =>
    /^(?:darwin|linux|win32)-.+-(?:ink-bun|ink-node|opentui-bun)\.json$/u.test(filename),
  );
  if (filenames.length === 0) {
    throw new ResultValidationError(`No candidate result records found in ${directory}`);
  }
  for (const filename of filenames) {
    const path = resolve(directory, filename);
    let record: unknown;
    try {
      record = JSON.parse(await readFile(path, "utf8"));
    } catch (cause: unknown) {
      if (cause instanceof SyntaxError) {
        throw new ResultValidationError(`${filename}: invalid JSON`, { cause });
      }
      throw cause;
    }
    await validateMeasurementRecord(record, filename);
  }
  process.stdout.write(`${filenames.length} result record(s) satisfy result.schema.json\n`);
}

try {
  await main();
} catch (cause: unknown) {
  const error = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
}
