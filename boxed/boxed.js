
const rp = require("request-promise");

const boxedApiUrl = "https://www.boxed.com/api/search/"
const boxedProductUrl = "https://www.boxed.com/product/"

class BoxedClient {
    async getSnackDetails(snackName) {
        return await search(snackName)[0]
    }

    getUrlForProductId(productId) {
       return boxedProductUrl + productId + "/product"
    }

    /// Does not support pagination
    async search(snackName) {
        console.log(snackName)
        let searchUrl = boxedApiUrl + encodeURIComponent(snackName.trim())

        console.log(`Searching Boxed for ${snackName} at ${searchUrl}`)

        let response = JSON.parse( await rp(searchUrl, {
            headers : {
                'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36"
            }
        }))
        
        let products = response["data"]["productListEntities"]

        if (!products) {
            console.log(`Searching Boxed for ${snackName} at ${searchUrl} failed, invalid response`, response)
            return undefined
        }

        console.log(`Searching Boxed for ${snackName} at ${searchUrl} returned ${products.length} products`)
        
        return products.map((product) => {
            return {
                name: product["name"],
                brand: product["variantObject"]["product"]["brand"],
                description: 
                product["variantObject"]["product"]["longDescription"] ||
                product["variantObject"]["product"]["shortDescription"],

                imageUrl: product["images"][0]["originalBase"],
                upc: product["variantObject"]["upc"],
                boxedId: product["variantObject"]["gid"],
                boxedUrl: this.getUrlForProductId(product["variantObject"]["gid"])
            }
        })
    }
}

module.exports = new BoxedClient()