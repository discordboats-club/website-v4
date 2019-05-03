const express = require("express");
const app = express();
const port = process.env.PORT || process.env.port || 3000;

app.set("view engine", "ejs");

app.use(require("./routes/"));
app.use(express.static("static"));

app.use((req, res) => {
    res.sendStatus(404);
});

app.listen(port, () => console.log(`Listening on port ${port}.`));