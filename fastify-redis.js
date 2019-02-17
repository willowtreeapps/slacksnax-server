const fp = require("fastify-plugin");

module.exports = fp((fastify, options, next) => {
    fastify.decorate("redis", require("./redis")).addHook("onClose", function(fastify, done) {
        fastify.redis.quit(done);
    });
    next();
});
