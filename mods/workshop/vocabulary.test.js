// The glossary's words, checked where a person reads them: the strings a Herdr mod can draw.
// Run with `node --test mods/workshop/*.test.js`; no Herdr, no dependencies.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const source = (name) => readFileSync(new URL(name, here), "utf8");

// GLOSSARY.md fixes these words; the code drifted three times in review, so each is banned
// from any drawn string. Whole words only: `recordSource` and `mods` are identifiers and paths.
const BANNED = ["source", "backup", "collision", "clash", "toolbar", "third party"];

// Every quoted or backticked literal in a file, with the line it sits on. Template literals that
// interpolate are skipped: their text is built from identifiers, not the words a person reads.
function drawnStrings(text) {
  const found = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
      const literal = match[1] ?? match[2] ?? match[3] ?? "";
      if (literal.includes("${") || line.trimStart().startsWith("//")) continue;
      found.push({ line: index + 1, text: literal });
    }
  });
  return found;
}

test("no drawn string uses a word the glossary bans", () => {
  for (const name of ["main.js", "tabbar.js"]) {
    for (const { line, text } of drawnStrings(source(name))) {
      for (const word of BANNED) {
        const pattern = new RegExp(`\\b${word}\\b`, "i");
        assert.ok(!pattern.test(text), `${name}:${line} draws "${text}" — the glossary says ${word} is not the word`);
      }
    }
  }
});

test("the Origin words are the glossary's three, spelled identically", () => {
  const glossary = source("../../GLOSSARY.md");
  const fixed = [...glossary.matchAll(/`(shipped|cloned|third_party)`/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(fixed)].sort(), ["cloned", "shipped", "third_party"]);

  const words = source("main.js").match(/const ORIGIN_WORDS = \{([^}]*)\}/);
  assert.ok(words, "ORIGIN_WORDS is declared in main.js");
  const pairs = words[1].split(",").filter((part) => part.includes(":"));
  assert.equal(pairs.length, 3);
  for (const pair of pairs) {
    const [key, value] = pair.split(":").map((part) => part.trim().replace(/^"|"$/g, ""));
    assert.equal(value, key, `ORIGIN_WORDS draws "${value}" for ${key}; the glossary fixes it as ${key}`);
  }
});
