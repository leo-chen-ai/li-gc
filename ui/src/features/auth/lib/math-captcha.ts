import { Parser } from "expr-eval";

const parser = new Parser({
  operators: {
    add: true,
    subtract: true,
    multiply: false,
    divide: false,
    power: false,
    concatenate: false,
    conditional: false,
    logical: false,
    comparison: false,
    factorial: false,
    in: false,
    assignment: false,
  },
});

export interface MathCaptcha {
  expression: string;
  answer: number;
}

export interface MathCaptchaOptions {
  random?: () => number;
}

export function createMathCaptcha(options: MathCaptchaOptions = {}): MathCaptcha {
  const random = options.random ?? Math.random;
  const useAddition = random() < 0.5;
  const left = pickOperand(random);
  const right = pickOperand(random);
  const expression = useAddition
    ? `${left} + ${right}`
    : `${Math.max(left, right)} - ${Math.min(left, right)}`;

  return {
    expression,
    answer: parser.evaluate(expression),
  };
}

export function isMathCaptchaAnswerValid(input: string, answer: number): boolean {
  if (!input.trim()) {
    return false;
  }

  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed === answer;
}

function pickOperand(random: () => number): number {
  return Math.floor(random() * 9) + 1;
}
