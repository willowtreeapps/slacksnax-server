const uuid = require("uuid/v4");

class StateStore {
    constructor() {
        this.storedState = {};
    }

    storeState(state) {
        let id = uuid();
        this.storedState[id] = state;
        return id;
    }

    retrieveState(id) {
        let state = this.peekState(id);
        this.deleteState(id);
        return state;
    }

    peekState(id) {
        return this.storedState[id];
    }

    deleteState(id) {
        delete this.storedState[id];
    }
}

module.exports = new StateStore();
