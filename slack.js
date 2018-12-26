const { WebClient } = require("@slack/client");
const rp = require("request-promise");
const fp = require("fastify-plugin");

const web = new WebClient();

const clientId = process.env.SLACK_CLIENT_ID;
const clientSecret = process.env.SLACK_CLIENT_SECRET;

class SlackClient {
    constructor(fastify) {
        this.fastify = fastify;
        this.actionHandlers = [];
        fastify.post("/slack/actions", this.handleAction);
    }

    async handleAction(request, reply) {
        this.actionHandlers.forEach(handler => handler(request, reply));
    }

    addActionHandler(action) {
        this.actionHandlers.push(action);
    }

    async getTokenForOauthCode(code) {
        let oauthResult = await web.oauth.access({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
        });

        if (oauthResult.ok) {
            return oauthResult;
        } else {
            throw new Error(oauthResult.error);
        }
    }

    callbacksForDelayedResponse(responseUrl) {
        let formatted = async response => {
            await rp.post(responseUrl, { json: true, body: response });
        };

        let text = async text => {
            await rp.post(responseUrl, {
                json: true,
                body: {
                    text: text,
                },
            });
        };

        let error = async () => {
            return await rp.post(responseUrl, {
                json: true,
                body: {
                    text: "Sorry an internal error has occurrred",
                },
            });
        };

        return { formatted, text, error };
    }
}

module.exports = fp((fastify, opts, next) => {
    fastify.decorate("Slack", new SlackClient(fastify));
    next();
});
