import { z } from "zod";

// Exact arithmetic over BigInt fractions. Number is never used for a value, so
// 0.1 + 0.2 is exactly 3/10 here, where Number gives 0.30000000000000004, and
// 1/3 is reported as the fraction it is instead of a silently rounded float.
const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
// A 200-character expression can nest deeply enough to overflow the stack.
const MAX_DEPTH = 20;
// An exponent beyond this would build a BigInt with more digits than the input
// is worth, and the work grows with every multiplication.
const MAX_EXPONENT = 100;

function gcd(a, b) {
    let left = a < 0n ? -a : a;
    let right = b < 0n ? -b : b;
    while (right !== 0n) [left, right] = [right, left % right];
    return left;
}

function rational(numerator, denominator = 1n) {
    if (denominator === 0n) throw new Error("Division by zero.");
    const sign = denominator < 0n ? -1n : 1n;
    const divisor = gcd(numerator, denominator) || 1n;
    return {
        numerator: (sign * numerator) / divisor,
        denominator: (sign * denominator) / divisor,
    };
}

function fromDecimal(text) {
    const [mantissa, exponentText] = text.toLowerCase().split("e");
    const exponent = exponentText === undefined ? 0 : Number(exponentText);
    if (Math.abs(exponent) > MAX_EXPONENT)
        throw new Error(
            `Exponent in ${text} is past the limit of ${MAX_EXPONENT}.`,
        );
    const [whole, fraction = ""] = mantissa.split(".");
    const digits = `${whole}${fraction}` === "" ? "0" : `${whole}${fraction}`;
    const value = BigInt(digits);
    const scale = fraction.length - exponent;
    return scale >= 0
        ? rational(value, 10n ** BigInt(scale))
        : rational(value * 10n ** BigInt(-scale));
}

function add(left, right) {
    return rational(
        left.numerator * right.denominator + right.numerator * left.denominator,
        left.denominator * right.denominator,
    );
}

function subtract(left, right) {
    return rational(
        left.numerator * right.denominator - right.numerator * left.denominator,
        left.denominator * right.denominator,
    );
}

function multiply(left, right) {
    return rational(
        left.numerator * right.numerator,
        left.denominator * right.denominator,
    );
}

function divide(left, right) {
    if (right.numerator === 0n) throw new Error("Division by zero.");
    return rational(
        left.numerator * right.denominator,
        left.denominator * right.numerator,
    );
}

// Recursive descent: expression = term (("+" | "-") term)*,
// term = unary (("*" | "/") unary)*, unary = ("+" | "-") unary | primary,
// primary = number | "(" expression ")". No eval, and no implicit
// multiplication: "2(3)" is an error, not 6.
function parse(expression) {
    let index = 0;
    let depth = 0;

    function skipSpaces() {
        while (expression[index] === " ") index += 1;
    }

    function fail(message) {
        throw new Error(`${message} at position ${index + 1}.`);
    }

    function primary() {
        skipSpaces();
        if (expression[index] === "(") {
            index += 1;
            depth += 1;
            if (depth > MAX_DEPTH) fail("Parentheses are nested too deeply");
            const value = sum();
            skipSpaces();
            if (expression[index] !== ")") fail('Expected ")"');
            index += 1;
            depth -= 1;
            return value;
        }
        const match = NUMBER.exec(expression.slice(index));
        if (match === null) fail(`Expected a number, found ${describe()}`);
        index += match[0].length;
        return fromDecimal(match[0]);
    }

    function unary() {
        skipSpaces();
        const sign = expression[index];
        if (sign === "+" || sign === "-") {
            index += 1;
            const value = unary();
            return sign === "-"
                ? rational(-value.numerator, value.denominator)
                : value;
        }
        return primary();
    }

    function product() {
        let value = unary();
        for (;;) {
            skipSpaces();
            const operator = expression[index];
            if (operator !== "*" && operator !== "/") return value;
            index += 1;
            const right = unary();
            value =
                operator === "*"
                    ? multiply(value, right)
                    : divide(value, right);
        }
    }

    function sum() {
        let value = product();
        for (;;) {
            skipSpaces();
            const operator = expression[index];
            if (operator !== "+" && operator !== "-") return value;
            index += 1;
            const right = product();
            value =
                operator === "+" ? add(value, right) : subtract(value, right);
        }
    }

    function describe() {
        const character = expression[index];
        return character === undefined
            ? "the end of the expression"
            : JSON.stringify(character);
    }

    const value = sum();
    skipSpaces();
    if (index !== expression.length) fail(`Unexpected ${describe()}`);
    return value;
}

// Render the exact fraction as a decimal, rounded half away from zero after
// `digits` places. `exact` says whether the printed value is the whole number.
function toDecimal(value, digits) {
    const { numerator, denominator } = value;
    if (denominator === 1n) return { value: `${numerator}`, exact: true };
    const scaled = numerator * 10n ** BigInt(digits);
    const quotient = scaled / denominator;
    const remainder = scaled % denominator;
    const negative = quotient < 0n;
    let printed = negative ? -quotient : quotient;
    const rest = remainder < 0n ? -remainder : remainder;
    if (rest * 2n >= denominator) printed += 1n;

    let text = printed.toString().padStart(digits + 1, "0");
    const whole = text.slice(0, text.length - digits);
    const fraction = text.slice(text.length - digits).replace(/0+$/, "");
    text = fraction === "" ? whole : `${whole}.${fraction}`;
    return { value: negative ? `-${text}` : text, exact: rest === 0n };
}

export const expressionTools = [
    [
        "evaluate_expression",
        "Evaluate an arithmetic expression exactly, locally: +, -, *, /, parentheses and unary signs over decimal numbers. Values are BigInt fractions, never floats, so 0.1 + 0.2 is 0.3 rather than 0.30000000000000004 and 9007199254740993 + 1 keeps its last digit. Results that do not terminate, such as 1/3, are rounded half away from zero to `digits` decimal places and returned with exact false and the exact fraction. Division by zero and malformed expressions are rejected. No network or model calls.",
        {
            expression: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Arithmetic to evaluate, for example '(1.5 + 2) * 3 / 4' or '1e3 - 0.25'.",
                ),
            digits: z
                .number()
                .int()
                .min(0)
                .max(20)
                .default(12)
                .describe(
                    "Decimal places kept when the result does not terminate.",
                ),
        },
        ({ expression, digits }) => {
            const value = parse(expression);
            const printed = toDecimal(value, digits);
            const result = {
                expression,
                value: printed.value,
                exact: printed.exact,
            };
            if (!printed.exact)
                result.fraction = `${value.numerator}/${value.denominator}`;
            return result;
        },
    ],
];
