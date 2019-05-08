require('dotenv').config();
var express = require('express');
var fs = require('fs');
var logger = require('morgan');

var app = express();

// constants
const r = (module.exports.r = require('rethinkdbdash')({
  db: 'discordboatsclub_v4',
  port: process.env.RETHINKDB_PORT || 28015,
  host: process.env.RETHINKDB_HOST || 'localhost'
}));
const JWT_KEY = (module.exports.JWT_KEY = fs
  .readFileSync('keys/jwt.key')
  .toString());
const PORT = process.env.PORT || 3001;

var client = require('./client');
client.login(process.env.DISCORD_CLIENT_TOKEN);

app.enable('trust proxy');
app.use(require('cloudflare-express').restore()); // so we can get their real ip
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(logger('dev'));

app.use(
  require('express-jwt')({
    secret: JWT_KEY,
    credentialsRequired: false,
    getToken: (req) => {
      if (
        req.headers.authorization &&
        req.headers.authorization.split(' ')[0] === 'JWT'
      ) {
        return req.headers.authorization.split(' ')[1];
      }
      return null;
    }
  }),
  async (req, res, next) => {
    if (!req.user) return next();
    let user = await r
      .table('users')
      .get(req.user)
      .run(); //req.user is the user id
    req.user = user; //now req.user is the user object
    next();
  }
);

// TODO: revamp permission system
// TODO: use JWT for bot api keys
// TODO: add endpoint to regen api key
// TODO: bot upvotes
// TODO: GDPR request data endpoint
// TODO: more API libraries?
// TODO: search bots
// TODO: manage todo list better
// TODO: PATCH /users/@me
// TODO: bot tags
// TODO: add featured true/false to PATCH /bots
// TODO: api docs
// TODO: discord bot lookup features
// TODO: let moderators edit bots, delete bots
app.use('/api/auth', require('./routes/auth'));
app.use('/api/bots', require('./routes/bots'));
app.use('/api/users', require('./routes/users'));

app.listen(PORT, () => console.log('[web] listening on port ' + PORT));
