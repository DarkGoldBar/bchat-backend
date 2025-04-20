const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

/**
 * 签发 token（有效期 2 小时）
 * @param {string} userId - 用户 ID
 * @returns {string} JWT token
 */
function signToken(userId) {
  return jwt.sign({ userId }, SECRET, { expiresIn: "2h" });
}

/**
 * 验证 token
 * @param {string} token - 前端传来的 token
 * @returns {object} payload 包含 userId
 * @throws 如果无效或过期，将抛出异常
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = {
  signToken,
  verifyToken,
};
