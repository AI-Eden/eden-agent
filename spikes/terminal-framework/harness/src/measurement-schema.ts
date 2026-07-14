import { readFile } from "node:fs/promises";
import { Ajv } from "ajv";

export class MeasurementSchemaError extends Error {
  readonly name = "MeasurementSchemaError";
}

const schemaUrl = new URL("../../results/result.schema.json", import.meta.url);

export async function validateMeasurementRecord(record: unknown, source: string): Promise<void> {
  const schemaValue: unknown = JSON.parse(await readFile(schemaUrl, "utf8"));
  if (
    typeof schemaValue !== "boolean" &&
    (typeof schemaValue !== "object" || schemaValue === null || Array.isArray(schemaValue))
  ) {
    throw new MeasurementSchemaError("The committed result schema is not a JSON Schema object");
  }
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validator = ajv.compile(schemaValue);
  if (!validator(record)) {
    const details = ajv.errorsText(validator.errors, { separator: "; " });
    throw new MeasurementSchemaError(`${source}: ${details}`);
  }
}
