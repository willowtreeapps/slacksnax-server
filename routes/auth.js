const Slack = require("../slack");

module.exports = async function routes(fastify) {
    fastify.get("/oauthCallback", async (request, reply) => {
        console.log(request.query);

        let code = request.query["code"];

        Slack.getTokenForOauthCode(code)
            .then(response => {
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

                    const authedTeam = matchingTeam
                        ? matchingTeam.set(newTeamContents)
                        : new AuthedTeam(newTeamContents);

                    authedTeam.save((err, savedTeam) => {
                        if (err) {
                            throw err;
                        }
                        console.log(savedTeam);
                        reply.send("Authentication Successful!");
                    });
                });
            })
            .catch(err => {
                reply.code = 500;
                reply.send(err);
            });
    });
};
