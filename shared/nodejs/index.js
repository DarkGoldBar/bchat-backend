const auth = require("./auth");
const utils = require("./utils");
const password = require("./password");

module.exports = {
  ...auth,
  ...utils,
  ...password,
};
