const fetch = require("node-fetch");
const { srvURL } = require("./");

module.exports = class Backend {
    constructor(token) {
        if (!token) throw new TypeError("token is undefined");
        this.token = token;
    }
    async getJSON(url) {
        console.log(this.token, url)
        return await (await fetch(url, {
            headers: { Authentication: `Bearer ${this.token}` }
        })).json();
    }
    async getUser(id = "@me") {
        console.log(await this.getJSON(`${srvURL}/api/users/${id}`));
        // return await this.getJSON(`${srvURL}/api/users/${id}`);
    }
};
