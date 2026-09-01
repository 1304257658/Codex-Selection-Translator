import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rendererSource = await readFile(new URL("../src/renderer.js", import.meta.url), "utf8");

test("provides separate speech controls for the original and translated text", () => {
  assert.match(rendererSource, /id="speak-original"/);
  assert.match(rendererSource, /id="speak-translation"/);
  assert.match(rendererSource, /new window\.SpeechSynthesisUtterance\(/);
  assert.match(rendererSource, /window\.speechSynthesis\.speak\(/);
  assert.match(rendererSource, /speakOriginal\.addEventListener\("click"/);
  assert.match(rendererSource, /speakTranslation\.addEventListener\("click"/);
});
