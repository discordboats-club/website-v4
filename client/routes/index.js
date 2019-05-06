const express = require("express");
const { srvURL } = require("../");
const fetch = require("node-fetch");
const app = module.exports = express.Router();
const Backend = require("../backend");

app.use(async (req, res, next) => {
    if (!req.cookies.discordboats_token) return next();
    const backend = req.backend = new Backend(req.cookies.discordboats_token);
    req.user = await backend.getUser();
    next();
});

app.get("/", async (req, res) => {
    res.render("index", {user: req.user});
});

app.get("/login", async (req, res) => {
    const code = req.query.code;
    const json = await (await fetch(`${srvURL}/api/auth/callback?code=${code}`)).json();
    res.cookie("discordboats_token", json.token);
    res.status(200).redirect("/");
});
