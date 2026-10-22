import { createInterface } from "node:readline";
import { randomBytes, scryptSync } from "node:crypto";

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
  console.error(
    "Run this command in a local interactive terminal. Do not pass a password on the command line."
  );
  process.exit(2);
}

function hiddenPrompt(label) {
  return new Promise(resolve => {
    const input = process.stdin;
    const output = process.stdout;
    let value = "";
    output.write(label);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = character => {
      if (character === "\u0003") {
        output.write("\n");
        input.setRawMode(false);
        process.exit(130);
      }
      if (character === "\r" || character === "\n") {
        input.off("data", onData);
        input.setRawMode(false);
        input.pause();
        output.write("\n");
        resolve(value);
        return;
      }
      if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
        return;
      }
      if (character >= " " && value.length < 256) value += character;
    };
    input.on("data", onData);
  });
}

const password = await hiddenPrompt(
  "Set a strong admin password (input hidden): "
);
if (password.length < 14) {
  console.error("Use a unique password with at least 14 characters.");
  process.exit(2);
}
const salt = randomBytes(16);
const derived = scryptSync(password, salt, 64);
console.log(
  `ADMIN_PASSWORD_HASH=scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`
);
console.log(
  "Copy this hash directly to the API site's protected environment variable. The password itself was not saved."
);
