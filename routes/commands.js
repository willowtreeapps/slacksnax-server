const Boxed = require("../boxed/boxed");
const Slack = require("../slack");
const SlackResponses = require("../slackresponses");
module.exports = async function routes(fastify) {
    let SnackRequest = fastify.models.SnackRequest;

    fastify.post("/boxedSearch", async (request, reply) => {
        let text = request.body["text"];
        try {
            let searchResults = await Boxed.search(text);
            request.log.debug(
                `Returning ${searchResults.length} products from product search for ${text}`
            );
            let productList = searchResults
                .map((product, index) => {
                    return ` 
                    Product #${index}: 
                        Name: ${product.name}
                        Description: ${product.description}
                        Image URL: ${product.imageUrl}
                        UPC: ${product.upc}
                        Boxed ID: ${product.boxedId}
                        Boxed URL: ${Boxed.getUrlForProductId(product.boxedId)}`;
                })
                .join("\n");

            reply.send(productList);
        } catch (err) {
            reply.status = 500;
            reply.send(err);
        }
    });

    async function findSnackRequestByText(text) {
        let results = await SnackRequest.find(
            { $text: { $search: text } },
            { score: { $meta: "textScore" } },
            {}
        )
            .sort({ score: { $meta: "textScore" } })
            .limit(1);
        return results[0];
    }

    fastify.post("/addBoxedSnack", async (request, reply) => {
        let response = Slack.callbacksForDelayedResponse(request.body["response_url"]);
        try {
            reply.send("Processing your request!");

            let text = request.body["text"];

            let userId = request.body["user_id"];
            let userName = request.body["user_name"];

            let newSnack = await Boxed.getSnackFromBoxedUrl(text);

            if (!newSnack) {
                //TODO: Use Boxed snack search to suggest an item
                await response.error("Are you sure that was a valid Boxed url?");
                return;
            }

        let currentRequester = {
            _id: userId,
            name: userName,
            userId: userId,
        };
            let currentRequester = {
                _id: userId,
                name: userName,
                userId: userId,
            };

            if (existingRequest) {
                request.log.trace(
                    "Found existing snack request for request: " + JSON.stringify(existingRequest)
                );

                // Make sure the current user is not the initial requester, or one of the additional requesters
                // prettier-ignore
                let isNewRequester =
                    existingRequest.initialRequester.userId != userId &&
                    existingRequest.additionalRequesters.every( requester => requester.userId != userId);

                if (isNewRequester) {
                    existingRequest.additionalRequesters.push(currentRequester);
                    await existingRequest.save();
                    await response.formatted(SlackResponses.addedRequester(existingRequest));
                } else {
                    await response.formatted(SlackResponses.alreadyRequested(existingRequest));
                }
            } else {
                let newSnackRequest = new SnackRequest({
                    originalRequestString: text,
                    initialRequester: currentRequester,
                    additionalRequesters: [],
                    snack: newSnack,
                });

                newSnackRequest.save(err => {
                    if (err) {
                        throw err;
                    }
                });
                await response.formatted(SlackResponses.createdRequest(newSnackRequest));
            }
        } catch (err) {
            response.error(err);
        }
    });
};
