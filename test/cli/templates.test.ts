import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TEMPLATES, templateFile, type TemplateSpec } from '../../src/cli/templates';
import { vocabulariesOf } from '../../src/registry/loadRegistry';
import { tables, toFile, toRow } from '../../src/schema';
import { compileSchemas } from '../../src/schema/compileSchemas';
import { slug } from '../../src/schema/primitives';
import { baseTree, registryOf } from '../fixtures/tree';

// The tree fixture's vocabularies, so the templates parse against fixed lists and not the data in registry/.
const files = compileSchemas(tables, vocabulariesOf(registryOf(baseTree()))).files;

const objectOf = (type: z.core.$ZodType): z.ZodObject | null => {
  if (type instanceof z.ZodObject) return type;
  if (type instanceof z.ZodOptional || type instanceof z.ZodNullable) return objectOf(type.unwrap() as z.core.$ZodType);
  if (type instanceof z.ZodArray) return objectOf(type.element as z.core.$ZodType);
  return null;
};

// Every place where the keys are not the schema's fields in the schema's order.
const misordered = (schema: z.ZodObject, value: Record<string, unknown>, at: string): string[] => {
  const own = Object.keys(value).join() === Object.keys(schema.shape).join() ? [] : [at];
  return [
    ...own,
    ...Object.entries(schema.shape).flatMap(([key, type]) => {
      const inner = objectOf(type as z.core.$ZodType);
      const items = value[key] == null || !inner ? [] : [value[key]].flat();
      return items.flatMap((item) => misordered(inner!, item as Record<string, unknown>, `${at}.${key}`));
    }),
  ];
};

// What the command puts where the template leaves null: a slug it makes and a legacy id it gives.
const MADE: Record<string, unknown> = { slug: 'made-by-the-command', legacyId: 9718 };

describe.each(Object.entries(TEMPLATES))('templates/%s.json', (name, spec: TemplateSpec) => {
  it('holds every field of its file in its blocks in schema order and parses, with the fields the command makes left null', () => {
    const { [spec.implied ?? '']: implied, ...file } = JSON.parse(
      readFileSync(templateFile(name as keyof typeof TEMPLATES), 'utf8'),
    );
    const omitted = new Set(spec.omits ?? []);
    const shape = Object.fromEntries(Object.entries(files[spec.table].shape).filter(([key]) => !omitted.has(key)));
    const row = toRow(spec.table, file);
    const made = Object.fromEntries(
      [...(spec.leftNull ?? []), ...(spec.derived ?? [])].map((key) => [key, MADE[key] ?? null]),
    );

    expect(misordered(z.strictObject(shape), file, name)).toEqual([]);
    expect((spec.leftNull ?? []).map((key) => row[key])).toEqual((spec.leftNull ?? []).map(() => null));
    expect(spec.implied ? slug.safeParse(implied).success : true).toBe(true);
    expect(files[spec.table].safeParse(toFile(spec.table, { ...row, ...made })).error?.issues ?? []).toEqual([]);
  });
});
