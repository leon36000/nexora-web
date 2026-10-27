import { describe, expect, it } from "vitest";
import { slugKnownAbsent } from "./known-slugs";
import { createSnapshotStore } from "./snapshots";

const pairs = [
  { "fr-CA": "", "en-CA": "" },
  { "fr-CA": "souverainete", "en-CA": "sovereignty" },
  { "fr-CA": "solutions/courriels", "en-CA": "solutions/email" },
];

describe("page inconnue pendant une panne de Directus", () => {
  it("sans liste connue des pages publiées, on ne peut rien affirmer (la page « indisponible » reste de mise)", () => {
    const store = createSnapshotStore({ dir: null });
    expect(slugKnownAbsent(store, "fr-CA", "page-inconnue")).toBe(false);
  });

  it("un slug absent de la dernière liste connue est une page inconnue (404)", () => {
    const store = createSnapshotStore({ dir: null });
    store.set("slug-pairs", pairs);
    expect(slugKnownAbsent(store, "fr-CA", "page-inconnue")).toBe(true);
    expect(slugKnownAbsent(store, "en-CA", "unknown")).toBe(true);
    // un slug français n'existe pas en anglais et inversement
    expect(slugKnownAbsent(store, "en-CA", "souverainete")).toBe(true);
  });

  it("un slug publié n'est jamais déclaré inconnu", () => {
    const store = createSnapshotStore({ dir: null });
    store.set("slug-pairs", pairs);
    expect(slugKnownAbsent(store, "fr-CA", "souverainete")).toBe(false);
    expect(slugKnownAbsent(store, "en-CA", "solutions/email")).toBe(false);
  });

  it("une liste vide ou illisible n'affirme rien", () => {
    const store = createSnapshotStore({ dir: null });
    store.set("slug-pairs", []);
    expect(slugKnownAbsent(store, "fr-CA", "x")).toBe(false);
    store.set("slug-pairs", "n'importe quoi");
    expect(slugKnownAbsent(store, "fr-CA", "x")).toBe(false);
  });
});
