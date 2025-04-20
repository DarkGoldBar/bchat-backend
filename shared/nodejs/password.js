const crypto = require("crypto");

function hashPassword(password) {
  const salt = "48fb053a";
  const hashedPassword = crypto
    .createHash("md5")
    .update(password + salt)
    .digest("hex");
  return hashedPassword;
}

exports.hashPassword = hashPassword;
