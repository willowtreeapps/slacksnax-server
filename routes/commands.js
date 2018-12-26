const Boxed = require("../boxed/boxed");
const SlackResponses = require("../slackresponses");
const StringSimiliarity = require("string-similarity");

const minRequestNameSimiliarity = 0.7;
const minRequestDescriptionSimiliarity = 0.8;

module.exports = async function routes(fastify) {
    const Slack = fastify.Slack;

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

    async function findSnackRequestById(id) {
        return await SnackRequest.findById(id);
    }

    function getSnackSimilarity(snackA, snackB) {
        let name = StringSimiliarity.compareTwoStrings(snackA.name || "", snackB.name || "");

        let description = StringSimiliarity.compareTwoStrings(
            snackA.description || "",
            snackB.description || ""
        );

        return {
            name,
            description,
        };
    }

    fastify.post("/addBoxedSnack", async (request, reply) => {
        let response = Slack.callbacksForDelayedResponse(request.body["response_url"]);
        try {
            //Send an immediate reply so the Slack command doesn't timeout
            await reply.send();
            await response.text("⏳");

            let text = request.body["text"];

            let userId = request.body["user_id"];
            let userName = request.body["user_name"];

            let newSnack = await Boxed.getSnackFromBoxedUrl(text);

            if (!newSnack) {
                //TODO: Use Boxed snack search to suggest an item
                await response.error("🤔 Are you sure that was a valid Boxed url?");
                return;
            }

            let existingRequest = await findSnackRequestByText(newSnack.name);
            let isExistingRequestSimilar = false;
            let isExistingExactlySame = false;
            if (existingRequest) {
                let similarity = getSnackSimilarity(existingRequest.snack, newSnack);

                isExistingRequestSimilar =
                    similarity.name > minRequestNameSimiliarity &&
                    similarity.description > minRequestDescriptionSimiliarity;

                isExistingExactlySame = existingRequest.snack.boxedId == newSnack.boxedId;
            }
            let currentRequester = {
                _id: userId,
                name: userName,
                userId: userId,
            };

            if (isExistingRequestSimilar && existingRequest) {
                request.log.trace(
                    "Found existing snack request for request: " + JSON.stringify(existingRequest)
                );

                if (!isExistingExactlySame) {
                    await response.formatted(
                        SlackResponses.similarRequest(
                            existingRequest,
                            newSnack,
                            currentRequester,
                            newSnack.boxedId
                        )
                    );
                } else {
                    await addAdditionalRequester(existingRequest, currentRequester, response);
                }
            } else {
                request.log.trace("Creating new snack request");
                await saveSnackRequest(text, currentRequester, newSnack, response);
            }
        } catch (err) {
            request.log.error("Failed to handle request to add Boxed Item", err.stack, err);
            response.error(err);
        }
    });

    async function saveSnackRequest(originalRequest, requester, snack, response) {
        let newSnackRequest = createSnackRequest(originalRequest, requester, snack);
        await newSnackRequest.save();

        await response.formatted(SlackResponses.createdRequest(newSnackRequest));
    }

    async function addAdditionalRequester(existingRequest, requester, response) {
        // Make sure the current user is not the initial requester, or one of the additional requesters
        // prettier-ignore
        let isNewRequester =
                    existingRequest.initialRequester.userId != requester.userId &&
                    existingRequest.additionalRequesters.every( requester => requester.userId != requester.userId);

        if (isNewRequester) {
            existingRequest.additionalRequesters.push(requester);
            await existingRequest.save();
            await response.formatted(SlackResponses.addedRequester(existingRequest));
        } else {
            await response.formatted(SlackResponses.alreadyRequested(existingRequest));
        }
    }

    function createSnackRequest(originalRequestString, requester, snack) {
        return new SnackRequest({
            originalRequestString: originalRequestString,
            initialRequester: requester,
            additionalRequesters: [],
            snack: snack,
        });
    }

    Slack.addActionHandler(
        (async (payload, request, reply) => {
            if (payload["callback_id"] != "resolve_similar_request") {
                return;
            }
            reply.code = 200;
            reply.send();

            let response = Slack.callbacksForDelayedResponse(payload["response_url"]);

            let action = payload["actions"][0];

            let name = action["name"];
            let value = JSON.parse(action["value"]);

            let requester = value["requester"];

            if (name == "addToExistingRequest") {
                let snackRequest = await findSnackRequestById(value["requestId"]);
                await addAdditionalRequester(snackRequest, requester, response);
            } else if (name == "createNewRequest") {
                request.log.trace("Creating new snack request");
                let productId = value["boxedId"];
                let snack = await Boxed.getSnackFromBoxedId(value["boxedId"]);
                await saveSnackRequest(
                    Boxed.getUrlForProductId(productId),
                    requester,
                    snack,
                    response
                );
            } else {
                request.log.err(
                    "No handler defined for resolve_similar_request action",
                    request.body
                );
            }
        }).bind(this)
    );
};
