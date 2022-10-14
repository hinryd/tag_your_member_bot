import express from "express";
import { Telegraf } from "telegraf";
import { Deta } from "deta";

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const deta = Deta(process.env.DETA_PROJECT_KEY);
const tags = deta.Base("tags");
const intros = deta.Base("intros");
let sessionPersisting = false;

bot.command("test", (ctx) => ctx.reply("BOT STATUS ACTIVE"));

bot.use(async (ctx, next) => {
  if (
    ctx.chat != undefined &&
    (ctx.chat.type === "private" || ctx.chat.type === "channel")
  ) {
    return ctx.reply(
      "Add me to a group to save intro and add weird tags to your group members!"
    );
  }
  await next(); // runs next middleware
});

bot.command("addintro", async (ctx) => {
  const m = ctx.message;
  if (
    m.reply_to_message === undefined ||
    m.reply_to_message.from === undefined
  ) {
    return ctx.reply("You are not replying to anyone!");
  }

  const sender = await ctx.telegram.getChatMember(m.chat.id, m.from.id);
  if (sender.status === "administrator" || sender.status === "creator") {
    const intro = m.text.split(" ").slice(1);
    if (intro.length <= 0) {
      return ctx.reply("Please enter something");
    }
    await intros.put({
      chatId: m.chat.id,
      userId: m.reply_to_message.from.id,
      intro: intro,
      createdOn: m.date,
    });
    return ctx.reply("Intro saved");
  } else {
    return ctx.reply("You are not an admin! You are a " + sender.status);
  }
});

bot.command("addtags", async (ctx) => {
  const m = ctx.message;
  if (
    m.reply_to_message === undefined ||
    m.reply_to_message.from === undefined
  ) {
    return ctx.reply("You are not replying to anyone!");
  }
  if (m.reply_to_message.from.id === m.from.id) {
    return ctx.reply("You cannot add tags to yourself!");
  }

  const newTags = m.text
    .split(" ")
    .slice(1)
    .map((tag) =>
      tag.replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>\{\}\[\]\\\/]/gi, "")
    )
    .filter((tag) => tag.length > 0);

  if (newTags.length <= 0) {
    return ctx.reply(
      "Please enter at least one tag, for example '/addtags happy fun'"
    );
  }

  const promises = newTags.map((tag) => {
    return tags.put({
      chatId: m.chat.id,
      userId: m.reply_to_message!.from!.id,
      tag: tag,
      createdOn: m.date,
    });
  });
  await Promise.all(promises);

  return ctx.reply(
    `Tag${newTags.length === 1 ? "" : "s"} saved: ${newTags
      .map((tag) => "#" + tag)
      .join(" ")}`
  );
});

bot.command("showtags", async (ctx) => {
  const m = ctx.message;
  if (
    m.reply_to_message === undefined ||
    m.reply_to_message.from === undefined
  ) {
    const res = await tags.fetch({
      chatId: m.chat.id,
      userId: m.from.id,
    });
    return ctx.reply(
      res.count == 0
        ? "You don't have any tags yet"
        : "You are " + res.items.map((i) => "#" + i["tag"]).join(" ")
    );
  } else {
    const res = await tags.fetch({
      chatId: m.chat.id,
      userId: m.reply_to_message.from.id,
    });
    return ctx.reply(
      res.count == 0
        ? m.reply_to_message.from.first_name + " don't have any tags yet"
        : m.reply_to_message.from.first_name +
            " is " +
            res.items.map((i) => "#" + i["tag"]).join(" ")
    );
  }
});

bot.command("deletetags", async (ctx) => {
  const m = ctx.message;
  if (
    m.reply_to_message === undefined ||
    m.reply_to_message.from === undefined
  ) {
    return ctx.reply("You are not replying to anyone!");
  }
  if (m.reply_to_message.from.id === m.from.id) {
    return ctx.reply("You cannot delete tags from yourself!");
  }

  const newTags = m.text.split(" ").slice(1);
  if (newTags.length <= 0) {
    return ctx.reply(
      "Please enter at least one tag, for example '/deletetags happy fun'"
    );
  }

  const fetchedTags = await tags.fetch(
    newTags.map((tag: any) => ({
      chatId: m.chat.id,
      userId: m.reply_to_message!.from!.id,
      tag: tag,
    }))
  );
  const promises = fetchedTags.items
    .map((i) => i["key"] as string)
    .map((key) => tags.delete(key));
  await Promise.all(promises);

  return ctx.reply(
    `Tag${newTags.length === 1 ? "" : "s"} deleted: ${newTags
      .map((tag) => "#" + tag)
      .join(" ")}`
  );
});

bot.command("searchtags", async (ctx) => {
  const m = ctx.message;
  const newTags = m.text.split(" ").slice(1);
  if (newTags.length <= 0) {
    return ctx.reply(
      "Please enter at least one tag, for example '/searchtags happy fun'"
    );
  }

  const fetchedTags = await tags.fetch(
    newTags.map((tag: any) => ({
      chatId: m.chat.id,
      tag: tag,
    }))
  );
  const userIds = Array.from(
    new Set(fetchedTags.items.map((i) => i["userId"] as number))
  );
  const members = await Promise.all(
    userIds.map((userId) => ctx.telegram.getChatMember(m.chat.id, userId))
  );

  return ctx.reply(
    `Tag${fetchedTags.items.length === 1 ? "" : "s"}:\n${fetchedTags.items
      .map(
        (i) =>
          `${
            members.find((member) => member.user.id === i["userId"])?.user
              .first_name ?? "Deleted Account"
          }: #${i["tag"]}`
      )
      .join("\n")}`
  );
});

async function startWebhook() {
  const wh = await bot.createWebhook({
    domain: process.env.WEBHOOK_DOMAIN!,
    max_connections: 100,
    drop_pending_updates: true,
  });
  app.use(wh);
}
startWebhook().then(() => (sessionPersisting = true));

app.get("/", (req, res) => {
  res.json({
    ...req.headers,
    "session-persisting": sessionPersisting,
  });
});

// no need for `app.listen()` on Deta, we run the app automatically.
module.exports = app; // make sure to export your `app` instance.
