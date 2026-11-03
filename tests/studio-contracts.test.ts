import test from "node:test"
import assert from "node:assert/strict"
import {
  brandKitSchema,
  characterSchema,
  projectSchema,
  shotSchema,
  parseRecordInput,
  creditsToUnits,
  unitsToCredits,
} from "../src/lib/studio/contracts"
import { csvCell, csvRow } from "../src/lib/studio/export"
import { providerConfigured } from "../src/lib/media/contracts"
test("Studio input rejects unbounded fields, arbitrary URLs and mismatched project categories", () => {
  assert.equal(
    brandKitSchema.safeParse({ name: "Brand", colors: ["red"] }).success,
    false,
  )
  assert.equal(
    brandKitSchema.safeParse({ name: "Brand", colors: ["#173D32", "#F9F8F3"] })
      .success,
    true,
  )
  assert.equal(
    characterSchema.safeParse({
      name: "Character",
      reference_asset_id: "https://attacker.test/image",
    }).success,
    false,
  )
  assert.equal(
    characterSchema.safeParse({ name: "Character", workspace_id: "injected" })
      .success,
    false,
  )
  assert.equal(
    projectSchema.safeParse({ name: "Project", budget_target_units: "-1" })
      .success,
    false,
  )
  assert.equal(
    projectSchema.safeParse({
      name: "Project",
      budget_target_units: "1000000000001",
    }).success,
    false,
  )
  assert.throws(() =>
    parseRecordInput("films", { name: "Film", kind: "campaign" }),
  )
  assert.equal(
    shotSchema.safeParse({
      project_id: "10000000-0000-4000-8000-000000000001",
      position: 0,
      prompt: "Scene",
    }).success,
    false,
  )
})
test("Planning credits use exact integer arithmetic and reject unsafe amounts", () => {
  assert.equal(creditsToUnits("16.001"), "16001")
  assert.equal(creditsToUnits("999999999.999"), "999999999999")
  assert.equal(unitsToCredits("16001"), "16.001")
  for (const value of ["-1", "NaN", "1e4", "0.0001", "1,000", "1000000000"])
    assert.throws(() => creditsToUnits(value))
})
test("Ledger exports quote CSV fields and neutralize spreadsheet formulas", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""')
  assert.equal(
    csvCell('=HYPERLINK("https://attacker.test")'),
    '"\'=HYPERLINK(""https://attacker.test"")"',
  )
  assert.equal(csvCell(-16000), '"-16000"')
  assert.ok(csvRow(["id", 16000, null]).endsWith("\r\n"))
})
test("A provider key alone never enables paid execution", () => {
  const oldKey = process.env.FAL_KEY,
    oldGate = process.env.CREATIVEOTTER_PAID_SERVICES_ENABLED
  try {
    process.env.FAL_KEY = "test-fixture-not-a-real-key"
    delete process.env.CREATIVEOTTER_PAID_SERVICES_ENABLED
    assert.equal(providerConfigured(), false)
    process.env.CREATIVEOTTER_PAID_SERVICES_ENABLED = "true"
    assert.equal(providerConfigured(), true)
  } finally {
    if (oldKey === undefined) delete process.env.FAL_KEY
    else process.env.FAL_KEY = oldKey
    if (oldGate === undefined)
      delete process.env.CREATIVEOTTER_PAID_SERVICES_ENABLED
    else process.env.CREATIVEOTTER_PAID_SERVICES_ENABLED = oldGate
  }
})

test("A gallery retains explicit selections and order across library pages", async () => {
  const { toggleGallerySelection } =
    await import("../src/lib/studio/gallery-selection")
  const { buildGalleryUrl, parseGalleryQuery } =
    await import("../src/lib/media/gallery-contracts")
  const first = {
    asset_id: "a",
    generation_id: "10000000-0000-4000-8000-000000000001",
    execution_source: "native" as const,
  }
  const second = {
    asset_id: "b",
    generation_id: "10000000-0000-4000-8000-000000000002",
    execution_source: "provider" as const,
  }
  let selected = toggleGallerySelection([], first)
  // The first asset is no longer in the currently rendered page when the second is selected.
  selected = toggleGallerySelection(selected, second)
  const url = new URL(
    buildGalleryUrl("https://example.test", {
      title: "Saved set",
      generations: selected.map(({ generation_id, execution_source }) => ({
        generation_id,
        execution_source,
      })),
    }),
  )
  assert.deepEqual(
    parseGalleryQuery(Object.fromEntries(url.searchParams)).generations,
    [
      { generation_id: first.generation_id, execution_source: "native" },
      { generation_id: second.generation_id, execution_source: "provider" },
    ],
  )
  assert.deepEqual(toggleGallerySelection(selected, first), [second])
  assert.throws(() =>
    toggleGallerySelection(selected, { ...first, asset_id: "another" }),
  )
})
