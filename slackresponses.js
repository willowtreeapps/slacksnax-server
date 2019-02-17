const Boxed = require("./boxed/boxed");

const getSnackRequestFields = (snackRequest, except) => {
    let fields = [
        {
            title: "Name",
            value: snackRequest.snack.name,
            short: true,
        },
        {
            title: "Description",
            value: snackRequest.snack.description,
            short: true,
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
            response_type: "ephemeral",
            replace_original: true,
            delete_original: true,
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
            response_type: "ephemeral",
            replace_original: true,
            delete_original: true,
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
            response_type: "ephemeral",
            replace_original: true,
            delete_original: true,
        };
    },
    boxedSearchResult: (name, imageUrl, description, boxedId, requester) => {
        return [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${name}*`,
                },
            },
            {
                type: "image",
                title: {
                    type: "plain_text",
                    text: "Product Image",
                    emoji: true,
                },
                image_url: `https://d2ln0cvn4pv5w2.cloudfront.net/unsafe/fit-in/256x256/filters:quality(100):max_bytes(200000):fill(white)/${imageUrl}`,
                alt_text: "Product Image",
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            emoji: true,
                            text: "Request This ✅",
                        },
                        value: JSON.stringify({
                            bi: boxedId,
                            n: requester.name,
                            ui: requester.userId,
                        }),
                        action_id: "createNewRequest",
                    },
                ],
            },
        ];
    },
    similarRequest: (existingRequest, newSnack, requester, boxedId) => {
        return {
            text: "🤔 It looks like a similar request was made earlier...",
            attachments: [
                {
                    pretext: "Here's a comparision",
                    image_url: existingRequest.snack.imageUrl,
                    thumb_url: newSnack.imageUrl,
                    fields: [
                        {
                            title: "Your snack's name",
                            value: newSnack.name,
                            short: true,
                        },
                        {
                            title: "Already requested snack's name",
                            value: existingRequest.snack.name,
                            short: true,
                        },
                        {
                            title: "Your snack's description",
                            value: newSnack.description,
                            short: true,
                        },
                        {
                            title: "Already requested snack's description",
                            value: existingRequest.snack.description,
                            short: true,
                        },
                    ],
                },
                {
                    pretext: "Do you want to add a vote for the existing item?",
                    fallback: "Looks like your workspace hasn't enabled buttons...",
                    callback_id: "resolve_similar_request",
                    color: "#3AA3E3",
                    attachment_type: "default",
                    actions: [
                        {
                            name: "addToExistingRequest",
                            text: "✅ Sure",
                            type: "button",
                            value: JSON.stringify({
                                ri: existingRequest._id,
                                n: requester.name,
                                ui: requester.userId,
                            }),
                        },
                        {
                            name: "createNewRequest",
                            text: "🙅 No, make a new request",
                            type: "button",
                            value: JSON.stringify({
                                bi: boxedId,
                                n: requester.name,
                                ui: requester.userId,
                            }),
                        },
                    ],
                },
            ],
            response_type: "ephemeral",
            replace_original: true,
            delete_original: true,
        };
    },
};
