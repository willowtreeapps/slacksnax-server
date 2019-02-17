const rp = require("request-promise");
const logger = require("../logger");
const redis = require("../redis");

const boxedApiUrl = "https://www.boxed.com/api/search/";
const boxedProductUrl = "https://www.boxed.com/product/";

const boxedProductLinkRegex = /.*boxed\.com\/product\/(.*?(?=[/]))/;

const boxedSearchCacheTtl = 60 * 60 * 4; //Store Boxed searches for 2 hours in cache
const boxedProductDetailsTtl = 60 * 60 * 24; //Store Boxed product details for 2 hours in cache

const apiUserAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36";

class BoxedClient {
    async getSnackFromBoxedUrl(boxedUrl) {
        let productMatches = boxedProductLinkRegex.exec(boxedUrl + "/");
        if (!productMatches) {
            return undefined;
        }

        let productId = productMatches[1];
        return this.getSnackFromBoxedId(productId);
    }

    async getSnackFromBoxedId(productId) {
        if (isNaN(productId)) {
            return undefined;
        }
        let productUrl = this.getUrlForProductId(productId);

        let redisKey = `boxed-product:${productId}`;

        let response = JSON.parse(await redis.get(redisKey));

        if (!response) {
            try {
                response = await rp(productUrl, {
                    headers: { "User-Agent": apiUserAgent, "api-json": true },
                    json: true,
                });
                await redis.set(redisKey, JSON.stringify(response), "ex", boxedProductDetailsTtl);
            } catch (err) {
                logger.error(`Failed to make request for Boxed URL ${productUrl}`, err);
                return undefined;
            }
        } else {
            logger.trace(`Got boxed product details from cache at key: ${redisKey}`);
        }

        let productPayload = response["data"]["productPayload"];

        if (!productPayload || !productPayload["variant"]) {
            logger.error(
                `Searching Boxed for ${productUrl} failed, invalid response`,
                JSON.stringify(response).slice(0, 100)
            );
            return undefined;
        }

        logger.trace(
            `Searching Boxed for ${productUrl} returned ${productPayload}`,
            JSON.stringify(response).slice(0, 100)
        );

        return {
            name: productPayload["variant"]["name"],
            brand:
                productPayload["variant"]["product"]["brand"] ||
                productPayload["variant"]["brandingText"] ||
                productPayload["variant"]["product"]["brandingText"],
            description:
                productPayload["variant"]["longDescription"] ||
                productPayload["variant"]["shortDescription"] ||
                productPayload["variant"]["product"]["longDescription"] ||
                productPayload["variant"]["product"]["shortDescription"],

            imageUrl: productPayload["variant"]["picture"],
            upc: productPayload["variant"]["upc"],
            boxedId: productPayload["variant"]["gid"],
        };
    }

    async getSnackDetails(snackName) {
        let results = await this.search(snackName);
        return results != undefined ? results[0] : undefined;
    }

    getUrlForProductId(productId) {
        return boxedProductUrl + productId + "/product";
    }

    /// Does not support pagination
    async search(snackName) {
        let searchUrl = boxedApiUrl + encodeURIComponent(snackName.trim());

        logger.info(`Searching Boxed for ${snackName} at ${searchUrl}`);

        let redisKey = `boxed-search:${searchUrl}`;

        let response = JSON.parse(await redis.get(redisKey));

        if (!response) {
            response = await rp(searchUrl, { headers: { "User-Agent": apiUserAgent }, json: true });
            await redis.set(redisKey, JSON.stringify(response), "ex", boxedSearchCacheTtl);
        } else {
            logger.trace(`Got boxed search result from cache at key: ${redisKey}`);
        }

        let products = response["data"]["productListEntities"];

        if (!products) {
            logger.debug(
                `Searching Boxed for ${snackName} at ${searchUrl} failed, invalid response`,
                response
            );
            return undefined;
        }

        logger.debug(
            `Searching Boxed for ${snackName} at ${searchUrl} returned ${products.length} products`
        );

        return products.map(product => {
            return {
                name: product["name"],
                brand: product["variantObject"]["product"]["brand"],
                description:
                    product["variantObject"]["product"]["longDescription"] ||
                    product["variantObject"]["product"]["shortDescription"],

                imageUrl: product["images"][0]["originalBase"],
                upc: product["variantObject"]["upc"],
                boxedId: product["variantObject"]["gid"],
            };
        });
    }
}

module.exports = new BoxedClient();
