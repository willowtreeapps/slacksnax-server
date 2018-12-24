const { Schema } = require("mongoose");
const fp = require("fastify-plugin");

module.exports = fp((fastify, opts, next) => {
    let Mongoose = fastify.Mongoose;

    let AuthedTeam = Mongoose.model(
        "authed_team",
        new Schema({
            _id: { type: String, trim: true, required: true },
            teamId: { type: String, trim: true, required: true },
            name: { type: String, trim: true, required: true },
            userId: { type: String, trim: true, required: true },
            token: { type: String, required: true },
        })
    );

    let RequesterSchema = new Schema({
        _id: { type: String, required: true },
        name: { type: String, trim: true, required: true },
        userId: { type: String, required: true },
    });

    let SnackSchema = new Schema({
        name: { type: String, required: true },
        brand: { type: String },
        description: { type: String },
        imageUrl: { type: String },
        upc: { type: String },
        boxedID: { type: String },
    });

    let SnackRequest = Mongoose.model(
        "snack_request",
        new Schema({
            originalRequestString: { type: String, trim: true, lowercase: true },
            initialRequester: { type: RequesterSchema, required: true },
            additionalRequesters: [RequesterSchema],
            snack: { type: SnackSchema, required: true },
        }).index(
            { originalRequestString: "text", "snack.name": "text" },
            {
                weights: {
                    originalRequestString: 5,
                    "snack.name": 10,
                },
            }
        )
    );

    fastify.decorate("models", {
        AuthedTeam,
        SnackRequest,
    });

    next();
});
