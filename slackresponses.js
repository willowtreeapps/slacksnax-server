const Boxed = require("./boxed/boxed");

const getSnackRequestFields = (snackRequest, except) => {
    let fields = [
        {
            title: "Name",
            value: snackRequest.snack.name,
            short: false,
        },
        {
            title: "Brand",
            value: snackRequest.snack.brand,
            short: true,
        },
        {
            title: "URL",
            value: Boxed.getUrlForProductId(snackRequest.snack.boxedId),
            short: true,
        },
        {
            title: "First Requested By",
            value: snackRequest.initialRequester.name,
            short: true,
        },
        {
            title: "Number of Requests",
            value: 1 + snackRequest.additionalRequesters.length,
            short: true,
        },
    ];

    //Remove undefined fields
    fields = fields.filter(field => field.value);
    return except ? fields.filter(field => !except.includes(field.title)) : fields;
};
module.exports = {
    addedRequester: request => {
        return {
            attachments: [
                {
                    // prettier-ignore
                    pretext: `${request.snack.name} was already added to the request list 😌
I'll just make a note that you want that too ✅`,
                    image_url: request.snack.imageUrl,
                    fields: getSnackRequestFields(request),
                },
            ],
        };
    },
    alreadyRequested: request => {
        return {
            attachments: [
                {
                    // prettier-ignore
                    pretext: `😒 You've already requested ${request.snack.name} 😒`,
                    image_url: request.snack.imageUrl,
                    fields: getSnackRequestFields(request),
                },
            ],
        };
    },
    createdRequest: request => {
        return {
            attachments: [
                {
                    // prettier-ignore
                    pretext: `🎉 A request has been created for ${request.snack.name}! 🎉`,
                    image_url: request.snack.imageUrl,
                    fields: getSnackRequestFields(request, "Number of Requests"),
                },
            ],
        };
    },
};
