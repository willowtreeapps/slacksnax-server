const monogoUri = process.env.MONGODB_URI;

const fastify = require("fastify")({
    logger: {
        level: "trace",
    },
});

require("dotenv").config();

const port = process.env.PORT || 1234;

fastify.register(require("fastify-formbody"));

fastify.register(require("fastify-mongoose-odm"), monogoUri, err => {
    if (err) throw err;
});

fastify.register(require("./fastify-redis"), {}, err => {
    if (err) throw err;
});

fastify.get("/", async () => {
    return "Hello World!";
});

fastify.register(require("./model.js"));
fastify.register(require("./slack.js"));

fastify.register(require("./routes/auth.js"));
fastify.register(require("./routes/commands.js"));

String.prototype.truncate = function(maxCharacters) {
    return this.length > maxCharacters ? this.substring(0, maxCharacters) + "…" : this;
};

const start = async () => {
    try {
        await fastify.listen(port, "0.0.0.0");

        fastify.log.info(fastify.printRoutes());
        fastify.log.info(`Listening on ${fastify.server.address().port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
