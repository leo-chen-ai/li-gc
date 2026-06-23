import assert from "node:assert/strict";
import test from "node:test";

import {
  createMathCaptcha,
  isMathCaptchaAnswerValid,
} from "./math-captcha.ts";

test("creates a deterministic addition captcha from injected random values", () => {
  const captcha = createMathCaptcha({
    random: sequenceRandom([0, 0, 0.4]),
  });

  assert.equal(captcha.expression, "1 + 4");
  assert.equal(captcha.answer, 5);
});

test("creates a deterministic subtraction captcha without negative answers", () => {
  const captcha = createMathCaptcha({
    random: sequenceRandom([0.9, 0, 0.8]),
  });

  assert.equal(captcha.expression, "8 - 1");
  assert.equal(captcha.answer, 7);
});

test("validates math captcha answers", () => {
  assert.equal(isMathCaptchaAnswerValid(" 8 ", 8), true);
  assert.equal(isMathCaptchaAnswerValid("7", 8), false);
  assert.equal(isMathCaptchaAnswerValid("", 8), false);
  assert.equal(isMathCaptchaAnswerValid("abc", 8), false);
});

function sequenceRandom(values: number[]) {
  let index = 0;

  return () => values[index++] ?? 0;
}
