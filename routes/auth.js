const Slack = require("../slack");

module.exports = async function routes(fastify) {
    fastify.get("/oauthCallback", async (request, reply) => {
        let code = request.query["code"];

        Slack.getTokenForOauthCode(code)
            .then(response => {
                request.log.trace("Got token for OAuth request");

                let AuthedTeam = fastify.models.AuthedTeam;

                const teamId = response["team_id"];

                let newTeamContents = {
                    _id: teamId,
                    teamId: teamId,
                    name: response["team_name"],
                    userId: response["user_id"],
                    token: response["access_token"],
                };

                AuthedTeam.findOne({ teamId: teamId }, (err, matchingTeam) => {
                    if (err) {
                        throw err;
                    }

                    let teamExists = !!matchingTeam;

                    const authedTeam = teamExists
                        ? matchingTeam.set(newTeamContents)
                        : new AuthedTeam(newTeamContents);

                    authedTeam.save(err => {
                        if (err) {
                            throw err;
                        }

                        request.log.info(
                            teamExists
                                ? `Updated OAuth token for team ${teamId}`
                                : `Added new team ${teamId}`
                        );

                        reply.send("Authentication Successful!");
                    });
                });
            })
            .catch(err => {
                request.log.error("Failed to get token for OAuth request", err);
                reply.code = 500;
                reply.send(err);
            });
    });
};
