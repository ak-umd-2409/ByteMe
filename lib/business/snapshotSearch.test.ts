import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PUBLIC_SNAPSHOTS } from "../../data/real/index.ts";
import { handleSearch } from "../api/handlers.ts";
import { disabledProvider } from "../llm/client.ts";
import { loadConfig } from "../shared/config.ts";
import { snapshotPlacesProvider } from "./snapshot.ts";

const p = snapshotPlacesProvider(PUBLIC_SNAPSHOTS);
const names = async (q: string) => (await p.search(q)).map((m) => m.name);

describe("saved-business search never swaps in an unrelated business", () => {
  it("doesn't match on the town alone", async () => {
    assert.deepEqual(await names("pizza Frederick MD"), []);
    assert.deepEqual(await names("Frederick dentist"), []);
  });

  it("finds a business by its name, with or without punctuation", async () => {
    assert.deepEqual(await names("Daves cooling"), ["Dave's Cooling & Heating"]);
    assert.equal((await names("Frederick Heating"))[0], "Frederick Heating & Air Conditioning");
  });

  it("the search API says live search is off and lists the saved businesses", async () => {
    const config = { ...loadConfig({}), googlePlacesApiKey: null };
    const res = await handleSearch({ q: "pizza Frederick" }, { config, places: p, llm: disabledProvider });
    const body = res.body as { matches: unknown[]; liveSearch: boolean; saved: { name: string }[] };
    assert.equal(res.status, 200);
    assert.deepEqual(body.matches, []);
    assert.equal(body.liveSearch, false);
    assert.equal(body.saved.length, PUBLIC_SNAPSHOTS.length);
  });
});
