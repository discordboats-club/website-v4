var express = require('express');
var jwt = require('jsonwebtoken');
var fetch = require('node-fetch');
var btoa = require('btoa');
const { r, JWT_KEY } = require('../');

var router = module.exports = express.Router();

router.get('/login', (req, res) => res.redirect(`https://discordapp.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.OAUTH_CALLBACK_URL)}&response_type=code&scope=identify%20email&prompt=none`));

router.get('/callback', async (req, res) => {
  if (!req.query.code) return res.sendStatus(400);
  let creds = btoa(`${process.env.DISCORD_CLIENT_ID}:${process.env.DISCORD_CLIENT_SECRET}`);
  let accessResponse = await fetch(`https://discordapp.com/api/oauth2/token?grant_type=authorization_code&code=${req.query.code}&redirect_uri=${encodeURIComponent(process.env.OAUTH_CALLBACK_URL)}`,
  {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${creds}`,
    'User-Agent': 'discordboats.club/4.0 (https://github.com/discordboats-club/website-v4)',
    'Content-Type': 'application/x-www-form-urlencoded'
  }
  });
  let access = await accessResponse.json();
  if (access.error) return res.sendStatus(500);

  let userResponse = await fetch(`https://discordapp.com/api/users/@me`,
  {
  headers: {
    'Authorization': `Bearer ${access.access_token}`,
    'User-Agent': 'discordboats.club/2.0 (https://discordboats.club)'
  }
  });
  let user = await userResponse.json();

  if (!await r.table('users').get(user.id).run()) {
    await r.table('users').insert({
      id: user.id,
      username: user.username,
      locale: user.locale,
      avatar: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`,
      tag: user.username + '#' + user.discriminator,
      discrim: user.discriminator,
      flags: [],

      ips: [req.cf_ip],
      email: user.email,

      discordAT: access.access_token,
      discordRT: access.refresh_token
    }).run();
  } else {
    await r.table('users').get(user.id).update({
      username: user.username,
      locale: user.locale,
      avatar: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`,
      tag: user.username + '#' + user.discriminator,
      discrim: user.discriminator,

      email: user.email,

      discordAT: access.access_token,
      discordRT: access.refresh_token
    }).run();
  }
  
  const JWT_TOKEN = await jwt.sign(user.id, JWT_KEY);
  res.json({ token: JWT_TOKEN });
});