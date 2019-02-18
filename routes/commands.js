const Boxed = require("../boxed/boxed");
const SlackResponses = require("../slackresponses");
const StringSimiliarity = require("string-similarity");
const uuid = require("uuid/v4");

const minRequestNameSimiliarity = 0.7;
const minRequestDescriptionSimiliarity = 0.8;

const buttonContextCacheTtl = 60 * 5; //The maximum amount of time the app will respond to a button request after it is created
module.exports = async function routes(fastify) {
    const Slack = fastify.Slack;

    let SnackRequest = fastify.models.SnackRequest;
    function flatten(arr) {
        return arr.reduce(function(flat, toFlatten) {
            return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
        }, []);
    }

    fastify.post("/boxedSearch", async (request, reply) => {
        let text = request.body["text"];

        let userId = request.body["user_id"];
        let userName = request.body["user_name"];

        let currentRequester = {
            _id: userId,
            name: userName,
            userId: userId,
        };

        try {
            let searchResults = await Boxed.search(text);
            searchResults = searchResults.slice(0, 10);
            request.log.debug(
                `Returning ${searchResults.length} products from product search for ${text}`
            );

            let blockList = flatten(
                await Promise.all(
                    searchResults.map(async product => {
                        let redisKey = `product-search-button-context:${uuid()}`;

                        await fastify.redis.set(
                            redisKey,
                            JSON.stringify({
                                boxedId: product.boxedId,
                                requester: currentRequester,
                            }),
                            "ex",
                            buttonContextCacheTtl
                        );

                        return SlackResponses.boxedSearchResult(
                            product.name,
                            product.imageUrl,
                            redisKey
                        );
                    })
                )
            );
            let response = {
                text: `Found ${searchResults.length} product(s) for ${text}`,
                blocks: blockList,
            };

            request.log.debug(response);

            reply.send(response);
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
    async function findSnackRequestByUpc(upc) {
        let results = await SnackRequest.find({
            "snack.upc": upc,
        }).limit(1);

        return results[0];
    }
    function getSnackSimilarity(snackA, snackB) {
        if (snackA.upc === snackB.upc) {
            return {
                name: 1,
                description: 1,
            };
        }
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
    async function startSnackRequest(userId, userName, request, response, productUrl) {
        let newSnack = await Boxed.getSnackFromBoxedUrl(productUrl);

        if (!newSnack) {
            //TODO: Use Boxed snack search to suggest an item
            await response.error("🤔 Are you sure that was a valid Boxed url?");
            return;
        }

        let currentRequester = {
            _id: userId,
            name: userName,
            userId: userId,
        };

        let isExistingRequestSimilar = false;
        let isExistingExactlySame = false;

        let existingRequest = await findSnackRequestByUpc(newSnack.upc);

        if (!existingRequest) {
            existingRequest = await findSnackRequestByText(newSnack.name);
        }

        if (existingRequest) {
            let similarity = getSnackSimilarity(existingRequest.snack, newSnack);

            isExistingRequestSimilar =
                similarity.name > minRequestNameSimiliarity &&
                similarity.description > minRequestDescriptionSimiliarity;

            isExistingExactlySame = existingRequest.snack.boxedId == newSnack.boxedId;
        }

        if (isExistingRequestSimilar && existingRequest) {
            request.log.trace(
                "Found existing snack request for request: " + JSON.stringify(existingRequest)
            );

            let redisKey = `similar-request-button-context:${uuid()}`;

            await fastify.redis.set(
                redisKey,
                JSON.stringify({
                    boxedId: newSnack.boxedId,
                    existingRequest,
                    requester: currentRequester,
                }),
                "ex",
                buttonContextCacheTtl
            );

            if (!isExistingExactlySame) {
                await response.formatted(
                    SlackResponses.similarRequest(existingRequest, newSnack, redisKey)
                );
            } else {
                await addAdditionalRequester(existingRequest, currentRequester, response);
            }
        } else {
            request.log.trace("Creating new snack request");
            await saveSnackRequest(productUrl, currentRequester, newSnack, response);
        }
    }

    fastify.post("/addBoxedSnack", async (request, reply) => {
        let response = Slack.callbacksForDelayedResponse(request.body["response_url"]);
        try {
            //Send an immediate reply so the Slack command doesn't timeout
            await reply.send();
            await response.text("⏳");

            let productUrl = request.body["text"];

            let userId = request.body["user_id"];
            let userName = request.body["user_name"];
            startSnackRequest(userId, userName, request, response, productUrl);
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
            let isBlockAction = payload["type"] === "block_actions";

            if (!isBlockAction && payload["callback_id"] != "resolve_similar_request") {
                return;
            }

            reply.code = 200;
            reply.send();

            let response = Slack.callbacksForDelayedResponse(payload["response_url"]);

            let action = payload["actions"][0];

            let name = action["name"] || action["action_id"];
            let actionStateRedisKey = action["value"];

            let actionState = JSON.parse(await fastify.redis.get(actionStateRedisKey));
            if (actionState === undefined) {
                await response.text("Your request timed out, please try again");
            }
            let requester = actionState.requester;

            let productId = actionState.boxedId;

            if (name == "addToExistingRequest") {
                await addAdditionalRequester(actionState.existingRequest, requester, response);
            } else if (name == "createNewRequest") {
                request.log.trace("Creating new snack request");
                await startSnackRequest(
                    requester.userId,
                    requester.name,
                    request,
                    response,
                    Boxed.getUrlForProductId(productId)
                );
            } else {
                if (!isBlockAction) {
                    request.log.err(
                        "No handler defined for resolve_similar_request action",
                        request.body
                    );
                }
            }

            await fastify.redis.del(actionStateRedisKey);
        }).bind(this)
    );
};
