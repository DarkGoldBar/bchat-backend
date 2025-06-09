/** @typedef {import('../types.js').BaseBoard} BaseBoard */
/** @typedef {import('../types.js').WebSocketResult} WebSocketResult */

/**
 * @typedef {Object} WuziqiState
 * @property {number[][]} board - 棋盘状态，二维数组表示棋盘格子
 * @property {number} currentMember - 当前玩家的标识，通常为 1 或 2
 * @property {[number, number]} lastMove - 最后一次移动的坐标
 * @property {number} winner - 胜利者的标识，0 表示没有胜利者
 * @property {number} turn - 当前轮次
 */

/**
 * @typedef {Object} WuziqiMeta
 * @property {[number, number]} size - 棋盘大小，通常为 [行数, 列数]
 * @property {number} winLength - 连线胜利所需的棋子数量
 * @property {number} memberLimit - 最大位置号
 * @property {boolean} enableRandomAddDrop - 是否启用额外随机落子
 * @property {boolean} enableUndo - 是否允许玩家撤销操作
 */

/** @implements {BaseBoard} */
class WuziqiBoard {
  /**
   * 创建一个新的五子棋棋盘实例
   * @param {string} [laststateStr] - 最后状态
   * @param {WuziqiMeta} meta - 对局静态规则
   */
  constructor(meta, laststateStr) {
    /** @type {WuziqiState} */
    this.last = laststateStr ? JSON.parse(laststateStr) : {};
    this.meta = meta;
  }

  /** @type {number[]} */
  static memberLimitList = [2];

  static new(meta) {
    const initialState = {
      board: Array.from({ length: meta.size[0] }, () =>
        Array(meta.size[1]).fill(0)
      ),
      currentMember: 1,
      lastMove: [-1, -1],
      winner: 0,
      turn: 0,
    };
    const obj = new WuziqiBoard(meta);
    obj.last = initialState;
    return obj;
  }

  move() {
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: "Method not implemented",
      }),
    };
  }
}
