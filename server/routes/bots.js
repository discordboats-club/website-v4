var express = require('express');
var createBotSchema = require('../schemas/createBot.js');
var editBotSchema = require('../schemas/editBot.js');
var postBotStats = require('../schemas/postBotStats.js');
var randomString = require('randomstring');
var { handleJoi, libraries, filterUnexpectedData, safeBot, getBadBots } = require('../util.js');
var { editBotLimiter } = require('../ratelimits.js');
var { r } = require('../');
var client = require('../client.js');

var router = module.exports = express.Router();

router.post('/', async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  if (!handleJoi(req, res, createBotSchema)) return;

  let badBots = await getBadBots();
  if (badBots.includes(req.body.id)) return res.status(403).json({ error: 'ValidationError', details: ['This bot is blacklisted']});

  if (req.body.github && !req.body.github.toLowerCase().startsWith('https://github.com')) return res.status(400).json({ error: 'ValidationError', details: ['Invalid Github URL'] });
  if (req.body.library && !libraries.includes(req.body.library)) return res.status(400).json({ error: 'ValidationError', details: ['Invalid library'] });

  let botUser = client.users.get(req.body.id) || await client.users.fetch(req.body.id);
  let ownerUser = await client.users.fetch(req.user.id);
  if (!ownerUser) return res.status(400).json({ error: 'ValidationError', details: ['Owner is not in discordboats discord guild'] });
  if (!botUser) return res.status(404).json({ error: 'BotRetrievalError', details: ['Invalid bot'] });
  if (!botUser.bot) return res.status(400).json({ error: 'ValidationError', details: ['Bot must be a bot'] });

  if (await r.table('bots').get(req.body.id).run()) return res.status(409).json({ error: 'ValidationError', details: ['Bot already exists'] });

  let bot = filterUnexpectedData(req.body,
    {
      username: botUser.username,
      discrim: botUser.discriminator,
      tag: botUser.tag,
      avatarUrl: botUser.avatarURL(),
      views: 0,
      inviteClicks: 0,
      apiKey: randomString.generate(30),
      ownerId: req.user.id,
      createdAt: new Date(),
      featured: false,
      premium: false,
      verified: null,
      verifiedAt: null,
      verifiedBy: null
    }, createBotSchema
  );

  await r.table('bots').insert(bot);

  let botLogChannel = client.guilds.get(process.env.DISCORD_GUILD_MAIN_ID).channels.find(c => c.name == 'bot-log');
  let modRole = client.guilds.get(process.env.DISCORD_GUILD_MAIN_ID).roles.find(r => r.name == 'Moderator');
  await botLogChannel.send(`📥 <@${req.user.id}> added **${botUser.tag}** (<@&${modRole.id}>)`);
  await ownerUser.send(`📥 Your bot **${botUser.tag}** has been added to the queue! Please wait for a moderator to review it.`);

  res.sendStatus(201);
});

router.delete('/:id', async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  if (!req.params.id) return res.sendStatus(400);
  let bot = await r.table('bots').get(req.params.id).run();
  if (!bot) return res.status(404).json({ error: 'BotRetrievalError', details: ['Invalid bot'] });
  // TODO: allow moderators to delete bots (i need to make a permission system first)
  if (bot.ownerId !== req.user.id) return res.sendStatus(403);

  await r.table('bots').get(req.params.id).delete().run();

  let botLogChannel = client.guilds.get(process.env.DISCORD_GUILD_MAIN_ID).channels.find(c => c.name == 'bot-log');
  await botLogChannel.send(`📤 <@${req.user.id}> deleted ${bot.tag}`);

  let ownerUser = await client.users.fetch(req.user.id);
  if (ownerUser) ownerUser.send(`📤 Your bot **${bot.tag}** has been deleted by <@${req.user.id}>`);

  res.sendStatus(204);
});

router.get('/', async (req, res) => {
  let botsFromDatabase = await r.table('bots').run();
  res.json(botsFromDatabase.map(bot => safeBot(bot)));
});

// TODO: add endpoints for bots for homepage - /featured, /trending, /top, /new - limit response to 12 bots?

router.get('/featured', async (req, res) => {
  let featuredBots = await r.table('bots').filter({ featured: true }).run();
  res.json(featuredBots.map(bot => safeBot(bot)));
});

router.get('/:id', async (req, res) => {
  let bot = await r.table('bots').get(req.params.id).run();
  if (!bot) return res.status(404).json({ error: 'BotRetrievalError', details: ['Invalid bot'] });
  res.json(safeBot(bot));
});

router.patch('/:id', editBotLimiter, async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  if (!handleJoi(req, res, editBotSchema)) return;

  let bot = await r.table('bots').get(req.params.id).run();
  if (!bot) return res.status(404).json({ error: 'BotRetrievalError', details: ['Invalid bot'] });
  if (bot.ownerId !== req.user.id) return res.sendStatus(403);

  let data = filterUnexpectedData(req.body, { verified: false }, editBotSchema);

  if (req.body.github && !req.body.github.toLowerCase().startsWith('https://github.com')) return res.status(400).json({ error: 'ValidationError', details: ['Invalid Github URL'] });
  if (req.body.library && !libraries.includes(req.body.library)) return res.status(400).json({ error: 'ValidationError', details: ['Invalid library'] });

  let botUser = client.users.get(bot.id) || await client.users.fetch(bot.id);

  await r.table('bots').get(bot.id).update(data).run();

  let botLogChannel = client.guilds.get(process.env.DISCORD_GUILD_MAIN_ID).channels.find(c => c.name == 'bot-log');
  let modRole = client.guilds.get(process.env.DISCORD_GUILD_MAIN_ID).roles.get(process.env.DISCORD_ROLE_MODERATOR_ID);
  await botLogChannel.send(`📝 <@${req.user.id}> edited **${botUser.tag}** (reverify, <@&${modRole.id}>)`);

  res.sendStatus(204);
});

router.post('/:id/verify', async (req, res) => {
  if (!req.user || !req.user.flags.includes('MODERATOR')) return res.sendStatus(403);
  if (req.query.verified == null) return res.sendStatus(400);
  let bot = await r.table('bots').get(req.params.id).run();
  if (!bot) return res.status(404).json({ error: 'BotRetrievalError', details: ['Invalid bot'] });
  await r.table('bots').get(req.params.id).update({ verified: req.query.verified, verifiedAt: Date.now(), verifiedBy: req.user.id }).run();
  if (!JSON.parse(req.query.verified)) await r.table('bots').get(req.params.id).delete().run();
  let botLogChannel = client.guilds.get(process.env.DISCORD_GUILD_MAIN_ID).channels.find(c => c.name == 'bot-log');
  await botLogChannel.send(`${JSON.parse(req.query.verified) ? '🎉' : '😦'} <@${req.user.id}> ${JSON.parse(req.query.verified) ? 'verified' : 'rejected'} **${bot.tag}** by <@${bot.ownerId}>`);
  let ownerUser = await client.users.fetch(bot.ownerId);
  await ownerUser.send(`${JSON.parse(req.query.verified) ? '🎉' : '😦'} Your bot **${bot.tag}** has been ${JSON.parse(req.query.verified) ? 'verified' : 'rejected'}`);
  res.json({ verified: req.query.verified });
});

router.post('/:id/stats', async (req, res) => {
  if (!handleJoi(req, res, postBotStats)) return;
  let bot = await r.table('bots').get(req.params.id).run();
  if (!bot) return res.status(404).json({ error: 'BotRetrievalError', details: ['Invalid bot'] });
  if (!req.headers.authorization) return res.sendStatus(401);
  if (bot.apiKey !== req.headers.authorization.split(' ')[1]) return res.sendStatus(403);
  await r.table('bots').get(req.params.id).update({ guildCount: req.body.guildCount });
  res.sendStatus(204);
});