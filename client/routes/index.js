const express = require("express");
const app = module.exports = express.Router();

app.get("/", async (req, res) => {
    res.render("index");
});