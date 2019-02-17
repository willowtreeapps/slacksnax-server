var Redis = require("ioredis");
var redis = new Redis(process.env.REDIS_URL);

module.exports = redis;
