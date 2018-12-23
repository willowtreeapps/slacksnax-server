const monogoUri = process.env.MONGODB_URI;

const fastify = require("fastify")();
fastify.log = console;

require("dotenv").config();

const port = process.env.PORT || 1234;

fastify.register(require("fastify-formbody"));
fastify.register(
    require("fastify-mongoose"),
    {
        uri: monogoUri,
    },
    err => {
        if (err) throw err;
    }
);

fastify.get("/", async () => {
    return "Hello World!";
});

fastify.register(require("./routes/auth.js"));
fastify.register(require("./routes/commands.js"));
fastify.register(require("./model.js"));

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
