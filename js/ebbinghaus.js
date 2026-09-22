/**
 * ebbinghaus.js — 艾宾浩斯复习引擎
 * 基于艾宾浩斯遗忘曲线管理单词的复习间隔和掌握状态。
 * 复习间隔阶段: [1天, 2天, 4天, 7天, 15天]
 * "掌握"定义: 英译中 AND 中译英都正确。
 * 导出为全局变量 window.EbbinghausEngine。
 */

(function (global) {
  'use strict';

  /** 一天的毫秒数 */
  var ONE_DAY = 86400000;

  /**
   * EbbinghausEngine — 艾宾浩斯复习引擎
   * 负责计算复习间隔、标记正确/错误、判断掌握状态、生成遗忘曲线数据
   */
  function EbbinghausEngine() {
    // 复习间隔天数: 阶段0=1天, 阶段1=2天, 阶段2=4天, 阶段3=7天, 阶段4=15天
    this.stages = [1, 2, 4, 7, 15];
  }

  /**
   * 获取某阶段的天数间隔
   * @param {number} stage - 阶段索引 0-4
   * @returns {number} 天数
   */
  EbbinghausEngine.prototype.getStageDays = function (stage) {
    if (stage < 0 || stage >= this.stages.length) {
      return this.stages[this.stages.length - 1];
    }
    return this.stages[stage];
  };

  /**
   * 获取最大阶段索引
   * @returns {number} 4
   */
  EbbinghausEngine.prototype.getMaxStage = function () {
    return this.stages.length - 1;
  };

  /**
   * 计算下次复习时间
   * - 如果 stage < maxStage，推进到 stage+1
   * - 如果 stage === maxStage，保持 maxStage（循环）
   * - nextReview = lastReview + stages[newStage] * ONE_DAY
   * @param {Object} word - 单词对象
   * @returns {Object} { stage, nextReview, lastReview }
   */
  EbbinghausEngine.prototype.scheduleNextReview = function (word) {
    var currentStage = word.ebbinghausStage || 0;
    var maxStage = this.getMaxStage();
    var newStage;

    if (currentStage < maxStage) {
      newStage = currentStage + 1;
    } else {
      // 已到最高阶段，保持循环
      newStage = maxStage;
    }

    var now = Date.now();
    var nextReview = now + this.stages[newStage] * ONE_DAY;

    return {
      stage: newStage,
      nextReview: nextReview,
      lastReview: now,
    };
  };

  /**
   * 判断是否到了复习时间
   * @param {Object} word - 单词对象
   * @returns {boolean}
   */
  EbbinghausEngine.prototype.isDueForReview = function (word) {
    if (!word.nextReview) {
      return true;
    }
    return word.nextReview <= Date.now();
  };

  /**
   * 判断是否掌握（两个方向都正确）
   * @param {Object} word - 单词对象
   * @returns {boolean}
   */
  EbbinghausEngine.prototype.isMastered = function (word) {
    return !!(
      word.directionMastery &&
      word.directionMastery.enToCn &&
      word.directionMastery.cnToEn
    );
  };

  /**
   * 标记正确，推进阶段
   * - 更新 directionMastery 中对应方向为 true
   * - 如果两个方向都正确，status = 'mastered'
   * - consecutiveCorrect++
   * - 推进 ebbinghausStage
   * - 更新 lastReview, nextReview
   * @param {Object} word - 单词对象
   * @param {string} direction - 'enToCn' | 'cnToEn'，本次正确的方向
   * @param {WordDB} db - 数据库实例（可选，传入则同时持久化）
   * @returns {Promise<Object>} 更新后的 word 对象
   */
  EbbinghausEngine.prototype.markCorrect = function (word, direction, db) {
    var self = this;

    // 确保 directionMastery 存在
    word.directionMastery = word.directionMastery || {
      enToCn: false,
      cnToEn: false,
    };

    // 更新对应方向的掌握状态
    if (direction === 'enToCn' || direction === 'cnToEn') {
      word.directionMastery[direction] = true;
    }

    // 检查是否两个方向都正确
    if (this.isMastered(word)) {
      word.status = 'mastered';
    } else if (word.status === 'new') {
      word.status = 'learning';
    }

    // 连续正确次数 +1
    word.consecutiveCorrect = (word.consecutiveCorrect || 0) + 1;

    // 复习次数 +1
    word.reviewCount = (word.reviewCount || 0) + 1;

    // 推进艾宾浩斯阶段
    var schedule = this.scheduleNextReview(word);
    word.ebbinghausStage = schedule.stage;
    word.lastReview = schedule.lastReview;
    word.nextReview = schedule.nextReview;

    // 如果提供了数据库实例，持久化更新
    if (db && word.id) {
      return db.updateWord(word.id, {
        directionMastery: word.directionMastery,
        status: word.status,
        consecutiveCorrect: word.consecutiveCorrect,
        reviewCount: word.reviewCount,
        ebbinghausStage: word.ebbinghausStage,
        lastReview: word.lastReview,
        nextReview: word.nextReview,
      }).then(function () {
        return word;
      });
    }

    return Promise.resolve(word);
  };

  /**
   * 标记错误，重置阶段
   * - status = 'error'
   * - errorCount++
   * - consecutiveCorrect = 0
   * - 重置 ebbinghausStage = 0
   * - nextReview = 明天
   * - 重置对应方向的 mastery
   * @param {Object} word - 单词对象
   * @param {string} direction - 'enToCn' | 'cnToEn'，本次错误的方向
   * @param {WordDB} db - 数据库实例（可选）
   * @returns {Promise<Object>} 更新后的 word 对象
   */
  EbbinghausEngine.prototype.markWrong = function (word, direction, db) {
    var self = this;
    var now = Date.now();

    // 设置状态为 error
    word.status = 'error';

    // 累计错误次数 +1
    word.errorCount = (word.errorCount || 0) + 1;

    // 重置连续正确次数
    word.consecutiveCorrect = 0;

    // 重置艾宾浩斯阶段
    word.ebbinghausStage = 0;

    // 下次复习时间为明天
    word.nextReview = now + ONE_DAY;
    word.lastReview = now;

    // 重置对应方向的掌握状态
    word.directionMastery = word.directionMastery || {
      enToCn: false,
      cnToEn: false,
    };
    if (direction === 'enToCn' || direction === 'cnToEn') {
      word.directionMastery[direction] = false;
    }

    // 持久化
    if (db && word.id) {
      return db.updateWord(word.id, {
        status: word.status,
        errorCount: word.errorCount,
        consecutiveCorrect: word.consecutiveCorrect,
        ebbinghausStage: word.ebbinghausStage,
        nextReview: word.nextReview,
        lastReview: word.lastReview,
        directionMastery: word.directionMastery,
      }).then(function () {
        return word;
      });
    }

    return Promise.resolve(word);
  };

  /**
   * 获取今日复习列表
   * - 调用 db.getTodayReviewWords() 获取待复习
   * - 调用 db.getTodayNewWords() 获取新词
   * @param {WordDB} db - 数据库实例
   * @returns {Promise<{reviewWords: Array, newWords: Array, total: number}>}
   */
  EbbinghausEngine.prototype.getTodaySchedule = function (db) {
    var self = this;

    return Promise.all([
      db.getTodayReviewWords(),
      db.getTodayNewWords(),
    ]).then(function (results) {
      var reviewWords = results[0] || [];
      var newWords = results[1] || [];

      return {
        reviewWords: reviewWords,
        newWords: newWords,
        total: reviewWords.length + newWords.length,
      };
    });
  };

  /**
   * 获取遗忘曲线数据点（用于图表展示）
   * 基于艾宾浩斯遗忘曲线公式: R = e^(-t/S)，其中 S=8 为记忆强度
   * @param {number} days - 天数，默认 15
   * @returns {Array<{day: number, retention: number}>}
   */
  EbbinghausEngine.prototype.getForgettingCurve = function (days) {
    days = days || 15;
    var S = 8; // 记忆强度
    var curve = [];

    for (var i = 0; i <= days; i++) {
      var t = i;
      var retention = Math.exp(-t / S) * 100;
      // 保留两位小数
      retention = Math.round(retention * 100) / 100;
      curve.push({
        day: t,
        retention: retention,
      });
    }

    return curve;
  };

  // 导出为全局变量
  global.EbbinghausEngine = EbbinghausEngine;
})(window);
