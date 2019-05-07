var express = require('express');
var createBotSchema = require('../schemas/createBot');
var editBotSchema = require('../schemas/editBot');
var postBotStats = require('../schemas/postBotStats');
var randomString = require('randomstring');
var {
  handleJoi,
  libraries,
  filterUnexpectedData,
  safeBot,
  getBadBots
} = require('../util');
var { editBotLimiter } = require('../ratelimits');
var { r } = require('../');
var client = require('../client');

var router = (module.exports = express.Router());

router.post('/', async (req, res) => {
  if (!req.user) return res.header('WWW-Authenticate', 'JWT').sendStatus(401);
  if (!handleJoi(req, res, createBotSchema)) return;

  let badBots = await getBadBots();
  if (badBots.includes(req.body.id))
    return res.status(403).json({ error: 'Blacklisted bot' });

  if (
    req.body.github &&
    !req.body.github.toLowerCase().startsWith('https://github.com')
  )
    return res.status(400).json({ error: 'Invalid GitHub URL' });
  if (req.body.library && !libraries.includes(req.body.library))
    return res.status(400).json({ error: 'Invalid library' }); //TODO: allow 'Other' library

  let botUser =
    client.users.get(req.body.id) || (await client.users.fetch(req.body.id));
  let ownerUser = await client.users.fetch(req.user.id);
  if (!ownerUser)
    return res.status(400).json({ error: 'Owner is not in Discord guild' });
  if (!botUser) return res.status(404).json({ error: 'Invalid bot' });
  if (!botUser.bot) return res.status(400).json({ error: 'Bot must be a bot' });

  if (
    await r
      .table('bots')
      .get(req.body.id)
      .run()
  )
    return res.status(409).json({ error: 'Bot already exists' });

  let bot = filterUnexpectedData(
    req.body,
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
    },
    createBotSchema
  );

  await r.table('bots').insert(bot);

  let botLogChannel = client.guilds
    .get(process.env.DISCORD_GUILD_MAIN_ID)
    .channels.find((c) => c.name == 'bot-log');
  let modRole = client.guilds
    .get(process.env.DISCORD_GUILD_MAIN_ID)
    .roles.find((r) => r.name == 'Moderator');
  await botLogChannel.send(
    `📥 <@${req.user.id}> added **${botUser.tag}** (<@&${modRole.id}>)`
  );
  await ownerUser.send(
    `📥 Your bot **${
      botUser.tag
    }** has been added to the queue! Please wait for a moderator to review it.`
  );

  res.sendStatus(201);
});

router.delete('/:id', async (req, res) => {
  if (!req.user) return res.header('WWW-Authenticate', 'JWT').sendStatus(401);
  if (!req.params.id) return res.sendStatus(400);
  let bot = await r
    .table('bots')
    .get(req.params.id)
    .run();
  if (!bot) return res.status(404).json({ error: 'Invalid bot' });
  // TODO: allow moderators to delete bots (i need to make a permission system first)
  if (bot.ownerId !== req.user.id) return res.status(403).json({ error: 'You can only delete bots you own' })

  await r
    .table('bots')
    .get(req.params.id)
    .delete()
    .run();

  let botLogChannel = client.guilds
    .get(process.env.DISCORD_GUILD_MAIN_ID)
    .channels.find((c) => c.name == 'bot-log');
  await botLogChannel.send(`📤 <@${req.user.id}> deleted ${bot.tag}`);

  let ownerUser = await client.users.fetch(req.user.id);
  if (ownerUser)
    ownerUser.send(
      `📤 Your bot **${bot.tag}** has been deleted by <@${req.user.id}>`
    );

  res.sendStatus(204);
});

router.get('/', async (req, res) => {
  let botsFromDatabase = await r.table('bots').run();
  res.json(botsFromDatabase.map((bot) => safeBot(bot)));
});

// TODO: add endpoints for bots for homepage - /featured, /trending, /top, /new - limit response to 12 bots?

router.get('/featured', async (req, res) => {
  let featuredBots = await r
    .table('bots')
    .filter({ featured: true })
    .run();
  res.json(featuredBots.map((bot) => safeBot(bot)));
});

router.get('/:id', async (req, res) => {
  let bot = await r
    .table('bots')
    .get(req.params.id)
    .run();
  if (!bot) return res.status(404).json({ error: 'Invalid bot' });
  res.json(safeBot(bot));
});

router.patch('/:id', editBotLimiter, async (req, res) => {
  if (!req.user) return res.header('WWW-Authenticate', 'JWT').sendStatus(401);
  if (!handleJoi(req, res, editBotSchema)) return;

  let bot = await r
    .table('bots')
    .get(req.params.id)
    .run();
  if (!bot) return res.status(404).json({ error: 'Invalid bot' });
  if (bot.ownerId !== req.user.id) return res.status(403).json({ error: 'You can only edit bots you own' });

  let data = filterUnexpectedData(req.body, { verified: false }, editBotSchema);

  if (
    req.body.github &&
    !req.body.github.toLowerCase().startsWith('https://github.com')
  )
    return res
      .status(400)
      .json({ error: 'ValidationError', details: ['Invalid Github URL'] });
  if (req.body.library && !libraries.includes(req.body.library))
    return res
      .status(400)
      .json({ error: 'ValidationError', details: ['Invalid library'] });

  let botUser = client.users.get(bot.id) || (await client.users.fetch(bot.id));

  await r
    .table('bots')
    .get(bot.id)
    .update(data)
    .run();

  let botLogChannel = client.guilds
    .get(process.env.DISCORD_GUILD_MAIN_ID)
    .channels.find((c) => c.name == 'bot-log');
  let modRole = client.guilds
    .get(process.env.DISCORD_GUILD_MAIN_ID)
    .roles.get(process.env.DISCORD_ROLE_MODERATOR_ID);
  await botLogChannel.send(
    `📝 <@${req.user.id}> edited **${botUser.tag}** (reverify, <@&${
      modRole.id
    }>)`
  );

  res.sendStatus(204);
});

// TODO: block multiple verification for same bot
router.post('/:id/verify', async (req, res) => {
  if (!req.user) return res.header('WWW-Authenticate', 'JWT').sendStatus(401);
  if (!req.user.flags.includes('moderator'))
    return res.status(403).json({ error: 'Insufficient permission' });
  if (req.query.verified == null) return res.sendStatus(400);
  let verified = JSON.parse(req.query.verified);

  let bot = await r
    .table('bots')
    .get(req.params.id)
    .run();
  if (!bot) return res.status(404).json({ error: 'Invalid bot' });

  await r
    .table('bots')
    .get(req.params.id)
    .update({
      verified: req.query.verified,
      verifiedAt: Date.now(),
      verifiedBy: req.user.id
    })
    .run();
  if (!verified)
    await r
      .table('bots')
      .get(req.params.id)
      .delete()
      .run();

  let botLogChannel = client.guilds
    .get(process.env.DISCORD_GUILD_MAIN_ID)
    .channels.find((c) => c.name == 'bot-log');
  await botLogChannel.send(
    `${verified ? '🎉' : '😦'} <@${req.user.id}> ${
      verified ? 'verified' : 'rejected'
    } **${bot.tag}** by <@${bot.ownerId}>`
  );

  let ownerUser = await client.users.fetch(bot.ownerId);
  await ownerUser.send(
    `${verified ? '🎉' : '😦'} Your bot **${bot.tag}** has been ${
      verified ? 'verified' : 'rejected'
    }`
  );

  res.json({ verified: req.query.verified });
});

router.post('/:id/stats', async (req, res) => {
  if (!handleJoi(req, res, postBotStats)) return;

  let bot = await r
    .table('bots')
    .get(req.params.id)
    .run();
  if (!bot) return res.status(404).json({ error: 'Invalid bot' });

  if (!req.headers.authorization) return res.header('WWW-Authenticate', 'API-Key').sendStatus(401);
  if (bot.apiKey !== req.headers.authorization.split(' ')[1])
    return res.status(403).json({ error: 'Invalid API key' });

  await r
    .table('bots')
    .get(req.params.id)
    .update({ guildCount: req.body.guildCount });
  res.sendStatus(204);
});
