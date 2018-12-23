const Boxed = require("../boxed/boxed");

module.exports = async function routes(fastify) {
    fastify.post("/boxedSearch", async (request, reply) => {
        let text = request.body["text"];
        try {
            let searchResults = await Boxed.search(text);

            let productList = searchResults
                .map((product, index) => {
                    return ` 
Product #${index}: 
    Name: ${product.name}
    Description: ${product.description}
    Image URL: ${product.imageUrl}
    UPC: ${product.upc}
    Boxed ID: ${product.boxedId}
    Boxed URL: ${product.boxedUrl}
                `;
                })
                .join("\n");

            console.log(productList);

            reply.send(productList);
        } catch (err) {
            reply.send(err);
        }
    });
};
