const Boxed = require("../boxed/boxed");
const SlackResponses = require("../slackresponses");
const StringSimiliarity = require("string-similarity");

const minRequestNameSimiliarity = 0.7;
const minRequestDescriptionSimiliarity = 0.8;

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
                searchResults.map(product =>
                    SlackResponses.boxedSearchResult(
                        product.name,
                        product.imageUrl,
                        product.description,
                        product.boxedId,
                        currentRequester
                    )
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
    async function startSnackRequest(userId, userName, request, response, productUrl) {
        let newSnack = await Boxed.getSnackFromBoxedUrl(productUrl);

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
            let value = JSON.parse(action["value"]);

            //ui = userId, ri = requestId, bi = boxedId, n = userName, due to Slack API limitations
            let requester = {
                _id: value["ui"],
                userId: value["ui"],
                name: value["n"],
            };

            let productId = value["bi"];

            if (name == "addToExistingRequest") {
                let snackRequest = await findSnackRequestById(value["ri"]);
                await addAdditionalRequester(snackRequest, requester, response);
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
        }).bind(this)
    );
};
