const express = require("express");
const app = express();
const proxy = require("express-http-proxy");
const port = process.env.PORT || process.env.port || 3000;
const srvPort = process.env.SRVPORT || 3001;
app.set("view engine", "ejs");

app.use(require("./routes/"));
app.use(express.static("static"));
app.use(proxy("http://localhost:" + srvPort));

app.use((req, res) => {
    res.sendStatus(404);
});

app.listen(port, () => console.log(`Listening on port ${port}.`));
