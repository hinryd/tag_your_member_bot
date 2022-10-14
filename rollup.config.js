// rollup.config.js
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import * as dotenv from "dotenv"; // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config();

export default {
  input: "src/index.ts",
  output: {
    file: "index.js",
    format: "cjs",
  },
  external: ["express", "telegraf", "deta"],
  plugins: [
    replace({
      preventAssignment: true,
      "process.env.TELEGRAM_BOT_TOKEN": JSON.stringify(
        process.env.TELEGRAM_BOT_TOKEN
      ),
      "process.env.DETA_PROJECT_KEY": JSON.stringify(
        process.env.DETA_PROJECT_KEY
      ),
      "process.env.WEBHOOK_DOMAIN": JSON.stringify(process.env.WEBHOOK_DOMAIN),
    }),
    typescript({
      esModuleInterop: true,
      removeComments: true,
    }),
    // terser(),
  ],
};
