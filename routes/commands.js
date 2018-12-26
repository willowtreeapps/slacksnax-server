const Boxed = require("../boxed/boxed");

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

    fastify.post("/addBoxedSnack", async request => {
        let text = request.body["text"];

        let userId = request.body["user_id"];
        let userName = request.body["user_name"];

        let snack = await Boxed.getSnackFromBoxedUrl(text);

        if (!snack) {
            //TODO: Use Boxed snack search to suggest an item
            throw new Error("Are you sure that was a valid Boxed url?");
        }

        let existingRequest = await findSnackRequestByText(snack.name);

        let currentRequester = {
            _id: userId,
            name: userName,
            userId: userId,
        };

        if (existingRequest) {
            request.log.trace(
                "Found existing snack request for request: " + JSON.stringify(existingRequest)
            );
            if (
                existingRequest.initialRequester.userId != userId &&
                existingRequest.additionalRequesters.every(requester => requester.userId != userId)
            ) {
                existingRequest.additionalRequesters.push(currentRequester);
                existingRequest.save(err => {
                    if (err) {
                        throw err;
                    }
                    return "Added requester to snack: " + JSON.stringify(existingRequest);
                });
            } else {
                return "Already requester to snack: " + JSON.stringify(existingRequest);
            }
        } else {
            let newSnackRequest = new SnackRequest({
                originalRequestString: text,
                initialRequester: currentRequester,
                additionalRequesters: [],
                snack: snack,
            });

            newSnackRequest.save(err => {
                if (err) {
                    throw err;
                }
            });
            return "Created Snack Request: " + JSON.stringify(newSnackRequest);
        }
    });
};
