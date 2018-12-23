const { Schema } = require("mongoose")
const fp = require('fastify-plugin')

module.exports = fp(function (fastify, opts, next) {
    let mongoose = fastify.mongo.db

    let AuthedTeam = mongoose.model("authed_team", new Schema({
        _id: { type: String, trim: true },
        teamId: { type: String, trim: true },
        name: { type: String, trim: true },
        userId: { type: String, trim: true },
        token: { type: String },

    }));

   

    fastify.decorate('models', {
            AuthedTeam : AuthedTeam
    })
  next()
})