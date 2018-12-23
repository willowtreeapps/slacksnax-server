const { WebClient } = require("@slack/client");

const web = new WebClient();

const clientId = process.env.SLACK_CLIENT_ID;
const clientSecret = process.env.SLACK_CLIENT_SECRET;

class SlackClient {
    async getTokenForOauthCode(code) {
        let oauthResult = await web.oauth.access({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
        });

        console.log("Result:", oauthResult);

        if (oauthResult.ok) {
            return oauthResult;
        } else {
            throw new Error(oauthResult.error);
        }
    }
}

module.exports = new SlackClient();
