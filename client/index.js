const express = require("express");
const app = express();
const proxy = require("express-http-proxy");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || process.env.port || 3000;
const srvPort = process.env.SRVPORT || 3001;
const srvURL = module.exports.srvURL = "http://localhost:" + srvPort;
app.set("view engine", "ejs");

app.use(cookieParser());
app.use(require("./routes/"));
app.use(express.static("static"));
app.use(proxy(srvURL));

app.use((req, res) => {
    res.sendStatus(404);
});

app.listen(port, () => console.log(`Listening on port ${port}.`));
