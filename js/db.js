/**
 * db.js — IndexedDB 数据层
 * 单词短语学习器的本地数据库封装，使用原生 IndexedDB API。
 * 提供 Word 对象的 CRUD、查询、错题记录、学习统计等功能。
 * 导出为全局变量 window.WordDB。
 */

(function (global) {
  'use strict';

  /** 一天的毫秒数 */
  var ONE_DAY = 86400000;

  /**
   * WordDB — IndexedDB 数据库封装类
   * 数据库名: WordPhraseLearner，版本: 1
   * 三个 objectStore: words, errorRecords, studySessions
   */
  function WordDB(dbName, version) {
    this.dbName = dbName || 'WordPhraseLearner';
    this.version = version || 1;
    this.db = null;
  }

  /**
   * 打开/创建数据库
   * 创建 3 个 objectStore: words, errorRecords, studySessions
   * words store 创建索引: status, nextReview, english
   * @returns {Promise<WordDB>}
   */
  WordDB.prototype.init = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(self.dbName, self.version);

      // 数据库升级时创建 objectStore 和索引
      request.onupgradeneeded = function (event) {
        var db = event.target.result;

        // words store: keyPath 'id', autoIncrement
        if (!db.objectStoreNames.contains('words')) {
          var wordsStore = db.createObjectStore('words', {
            keyPath: 'id',
            autoIncrement: true,
          });
          wordsStore.createIndex('status', 'status', { unique: false });
          wordsStore.createIndex('nextReview', 'nextReview', { unique: false });
          wordsStore.createIndex('english', 'english', { unique: false });
        }

        // errorRecords store: keyPath 'id', autoIncrement
        if (!db.objectStoreNames.contains('errorRecords')) {
          db.createObjectStore('errorRecords', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }

        // studySessions store: keyPath 'id', autoIncrement
        if (!db.objectStoreNames.contains('studySessions')) {
          db.createObjectStore('studySessions', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      };

      request.onsuccess = function (event) {
        self.db = event.target.result;
        resolve(self);
      };

      request.onerror = function (event) {
        console.error('[WordDB] 数据库打开失败:', event.target.error);
        reject(event.target.error);
      };
    });
  };

  // ==================== 工具方法 ====================

  /**
   * 获取事务并返回 store
   * @param {string} storeName - store 名称
   * @param {string} mode - 事务模式 'readonly' | 'readwrite'
   * @returns {IDBObjectStore}
   */
  WordDB.prototype._getStore = function (storeName, mode) {
    var tx = this.db.transaction(storeName, mode || 'readonly');
    return tx.objectStore(storeName);
  };

  /**
   * 包装 IDBRequest 为 Promise
   */
  WordDB.prototype._wrapRequest = function (request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function (e) {
        resolve(e.target.result);
      };
      request.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  // ==================== 单词 CRUD ====================

  /**
   * 添加新单词
   * @param {string} english - 英文单词/短语
   * @param {string} chinese - 中文意思
   * @param {string} phonetic - 音标（可选）
   * @param {string} source - 来源 'manual' | 'ocr'
   * @returns {Promise<number>} 新单词的 id
   */
  WordDB.prototype.addWord = function (english, chinese, phonetic, source) {
    var self = this;
    var now = Date.now();

    var word = {
      english: english,
      chinese: chinese,
      phonetic: phonetic || '',
      createdAt: now,
      source: source || 'manual',
      status: 'new',
      reviewCount: 0,
      nextReview: now, // 新词立即可学
      lastReview: 0,
      ebbinghausStage: 0,
      directionMastery: {
        enToCn: false,
        cnToEn: false,
      },
      errorCount: 0,
      consecutiveCorrect: 0,
    };

    var store = this._getStore('words', 'readwrite');
    return this._wrapRequest(store.add(word));
  };

  /**
   * 根据 id 获取单词
   * @param {number} id - 单词 id
   * @returns {Promise<Object>}
   */
  WordDB.prototype.getWord = function (id) {
    var store = this._getStore('words', 'readonly');
    return this._wrapRequest(store.get(id));
  };

  /**
   * 获取所有单词
   * @returns {Promise<Array>}
   */
  WordDB.prototype.getAllWords = function () {
    var store = this._getStore('words', 'readonly');
    return this._wrapRequest(store.getAll());
  };

  /**
   * 部分更新单词
   * @param {number} id - 单词 id
   * @param {Object} updates - 要更新的字段
   * @returns {Promise<void>}
   */
  WordDB.prototype.updateWord = function (id, updates) {
    var self = this;
    var store = this._getStore('words', 'readwrite');

    return new Promise(function (resolve, reject) {
      var getRequest = store.get(id);
      getRequest.onsuccess = function (e) {
        var word = e.target.result;
        if (!word) {
          reject(new Error('单词不存在: id=' + id));
          return;
        }

        // 合并更新
        for (var key in updates) {
          if (updates.hasOwnProperty(key)) {
            // 处理 directionMastery 嵌套对象
            if (key === 'directionMastery' && typeof updates[key] === 'object') {
              word.directionMastery = word.directionMastery || {};
              for (var dk in updates[key]) {
                if (updates[key].hasOwnProperty(dk)) {
                  word.directionMastery[dk] = updates[key][dk];
                }
              }
            } else {
              word[key] = updates[key];
            }
          }
        }

        var putRequest = store.put(word);
        putRequest.onsuccess = function () {
          resolve();
        };
        putRequest.onerror = function (e) {
          reject(e.target.error);
        };
      };
      getRequest.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  /**
   * 删除单词
   * @param {number} id - 单词 id
   * @returns {Promise<void>}
   */
  WordDB.prototype.deleteWord = function (id) {
    var store = this._getStore('words', 'readwrite');
    return this._wrapRequest(store.delete(id));
  };

  // ==================== 查询 ====================

  /**
   * 获取今日待复习的单词（nextReview <= now）
   * 包括已掌握但仍需定期复习的词
   * @returns {Promise<Array>}
   */
  WordDB.prototype.getTodayReviewWords = function () {
    var self = this;
    var now = Date.now();
    var store = this._getStore('words', 'readonly');
    var index = store.index('nextReview');

    return new Promise(function (resolve, reject) {
      // 使用 IDBKeyRange.upperBound 获取 nextReview <= now 的所有记录
      var range = IDBKeyRange.upperBound(now);
      var results = [];
      var cursorRequest = index.openCursor(range);

      cursorRequest.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          // 排除 status === 'new' 的词（新词单独获取）
          if (cursor.value.status !== 'new') {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      cursorRequest.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  /**
   * 获取今日新词（status === 'new'）
   * @returns {Promise<Array>}
   */
  WordDB.prototype.getTodayNewWords = function () {
    var self = this;
    var store = this._getStore('words', 'readonly');
    var index = store.index('status');

    return new Promise(function (resolve, reject) {
      var results = [];
      var cursorRequest = index.openCursor(IDBKeyRange.only('new'));

      cursorRequest.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      cursorRequest.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  /**
   * 获取已掌握的单词（两个方向都正确）
   * @returns {Promise<Array>}
   */
  WordDB.prototype.getMasteredWords = function () {
    var self = this;
    var store = this._getStore('words', 'readonly');

    return new Promise(function (resolve, reject) {
      var results = [];
      var cursorRequest = store.openCursor();

      cursorRequest.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          var w = cursor.value;
          if (
            w.directionMastery &&
            w.directionMastery.enToCn &&
            w.directionMastery.cnToEn
          ) {
            results.push(w);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      cursorRequest.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  /**
   * 获取错题单词（status === 'error' 或 errorCount > 0）
   * @returns {Promise<Array>}
   */
  WordDB.prototype.getErrorWords = function () {
    var self = this;
    var store = this._getStore('words', 'readonly');

    return new Promise(function (resolve, reject) {
      var results = [];
      var cursorRequest = store.openCursor();

      cursorRequest.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          var w = cursor.value;
          if (w.status === 'error' || w.errorCount > 0) {
            results.push(w);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      cursorRequest.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  /**
   * 搜索单词（英文或中文包含关键词）
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Array>}
   */
  WordDB.prototype.searchWords = function (keyword) {
    var self = this;
    var lowerKeyword = (keyword || '').toLowerCase();

    return this.getAllWords().then(function (words) {
      if (!lowerKeyword) {
        return words;
      }
      return words.filter(function (w) {
        return (
          (w.english && w.english.toLowerCase().indexOf(lowerKeyword) !== -1) ||
          (w.chinese && w.chinese.indexOf(keyword) !== -1)
        );
      });
    });
  };

  // ==================== 错题记录 ====================

  /**
   * 添加错题记录
   * @param {number} wordId - 单词 id
   * @param {string} direction - 错误方向 'enToCn' | 'cnToEn'
   * @param {string} userAnswer - 用户答案
   * @param {string} correctAnswer - 正确答案
   * @returns {Promise<number>} 错题记录 id
   */
  WordDB.prototype.addErrorRecord = function (wordId, direction, userAnswer, correctAnswer) {
    var record = {
      wordId: wordId,
      direction: direction,
      userAnswer: userAnswer || '',
      correctAnswer: correctAnswer || '',
      createdAt: Date.now(),
      resolved: false,
    };

    var store = this._getStore('errorRecords', 'readwrite');
    return this._wrapRequest(store.add(record));
  };

  /**
   * 获取所有错题记录
   * @returns {Promise<Array>}
   */
  WordDB.prototype.getErrorRecords = function () {
    var store = this._getStore('errorRecords', 'readonly');
    return this._wrapRequest(store.getAll());
  };

  /**
   * 标记错题已掌握
   * @param {number} wordId - 单词 id
   * @returns {Promise<void>}
   */
  WordDB.prototype.resolveError = function (wordId) {
    var self = this;
    var store = this._getStore('errorRecords', 'readwrite');

    return new Promise(function (resolve, reject) {
      var cursorRequest = store.openCursor();
      var resolveCount = 0;

      cursorRequest.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          if (cursor.value.wordId === wordId && !cursor.value.resolved) {
            var updated = cursor.value;
            updated.resolved = true;
            updated.resolvedAt = Date.now();
            cursor.update(updated);
            resolveCount++;
          }
          cursor.continue();
        } else {
          // 同时将单词状态从 error 改为 learning
          self.getWord(wordId).then(function (word) {
            if (word && word.status === 'error') {
              return self.updateWord(wordId, { status: 'learning' });
            }
          }).then(function () {
            resolve(resolveCount);
          }).catch(reject);
        }
      };

      cursorRequest.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  // ==================== 学习记录 ====================

  /**
   * 保存学习记录
   * @param {Object} data - {date, newWords, reviewWords, testScore, errors}
   * @returns {Promise<number>} 学习记录 id
   */
  WordDB.prototype.saveStudySession = function (data) {
    var self = this;
    var now = Date.now();
    var todayStart = this._getTodayStart();
    var yesterdayStart = todayStart - ONE_DAY;

    var session = {
      date: data.date || this._formatDate(now),
      timestamp: now,
      newWords: data.newWords || 0,
      reviewWords: data.reviewWords || 0,
      testScore: data.testScore || 0,
      errors: data.errors || 0,
    };

    // 检查昨天是否有学习记录，用于计算 streak
    return this._getLastSessionBefore(yesterdayStart + ONE_DAY).then(function (lastSession) {
      if (lastSession && lastSession.timestamp >= yesterdayStart) {
        // 昨天有记录，streak + 1
        session.streak = (lastSession.streak || 1) + 1;
      } else {
        // 昨天没有记录，streak 重置为 1
        session.streak = 1;
      }

      var store = self._getStore('studySessions', 'readwrite');
      return self._wrapRequest(store.add(session));
    });
  };

  /**
   * 获取最近 N 天的学习统计
   * @param {number} days - 天数，默认 30
   * @returns {Promise<Array>} 每天的学习记录
   */
  WordDB.prototype.getStudyStats = function (days) {
    days = days || 30;
    var cutoff = Date.now() - days * ONE_DAY;
    var store = this._getStore('studySessions', 'readonly');

    return new Promise(function (resolve, reject) {
      var results = [];
      var cursorRequest = store.openCursor();

      cursorRequest.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          if (cursor.value.timestamp >= cutoff) {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      cursorRequest.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  /**
   * 获取连续学习天数
   * @returns {Promise<number>}
   */
  WordDB.prototype.getStreak = function () {
    var self = this;
    var store = this._getStore('studySessions', 'readonly');

    return new Promise(function (resolve, reject) {
      var cursorRequest = store.openCursor(null, 'prev');
      var streak = 0;
      var expectedDate = self._getTodayStart();

      cursorRequest.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          var sessionDate = self._getDayStart(cursor.value.timestamp);

          // 如果是今天或昨天，继续追踪
          if (sessionDate === expectedDate) {
            streak = cursor.value.streak || streak + 1;
            resolve(streak);
            return;
          }

          // 如果比期望日期早一天，说明昨天学了但今天还没学
          if (sessionDate === expectedDate - ONE_DAY) {
            streak = cursor.value.streak || 1;
            resolve(streak);
            return;
          }

          // 日期太早，streak 断了
          if (sessionDate < expectedDate - ONE_DAY) {
            resolve(0);
            return;
          }

          cursor.continue();
        } else {
          resolve(streak);
        }
      };

      cursorRequest.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  // ==================== 统计 ====================

  /**
   * 获取掌握度统计
   * @returns {Promise<{total, mastered, learning, error, new}>}
   */
  WordDB.prototype.getMasteryStats = function () {
    return this.getAllWords().then(function (words) {
      var stats = {
        total: words.length,
        mastered: 0,
        learning: 0,
        error: 0,
        new: 0,
      };

      words.forEach(function (w) {
        if (
          w.directionMastery &&
          w.directionMastery.enToCn &&
          w.directionMastery.cnToEn
        ) {
          stats.mastered++;
        } else if (w.status === 'error') {
          stats.error++;
        } else if (w.status === 'learning') {
          stats.learning++;
        } else if (w.status === 'new') {
          stats.new++;
        } else {
          stats.learning++;
        }
      });

      return stats;
    });
  };

  // ==================== 内部工具方法 ====================

  /**
   * 获取今天 0 点的时间戳
   */
  WordDB.prototype._getTodayStart = function () {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  };

  /**
   * 获取某时间戳当天 0 点的时间戳
   */
  WordDB.prototype._getDayStart = function (timestamp) {
    var d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  WordDB.prototype._formatDate = function (timestamp) {
    var d = new Date(timestamp);
    var year = d.getFullYear();
    var month = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return year + '-' + month + '-' + day;
  };

  /**
   * 获取某个时间点之前最近的一条学习记录
   * @param {number} beforeTimestamp
   * @returns {Promise<Object|null>}
   */
  WordDB.prototype._getLastSessionBefore = function (beforeTimestamp) {
    var store = this._getStore('studySessions', 'readonly');

    return new Promise(function (resolve, reject) {
      var cursorRequest = store.openCursor(null, 'prev');
      var found = null;

      cursorRequest.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          if (cursor.value.timestamp < beforeTimestamp) {
            found = cursor.value;
            resolve(found);
            return;
          }
          cursor.continue();
        } else {
          resolve(found);
        }
      };

      cursorRequest.onerror = function (e) {
        reject(e.target.error);
      };
    });
  };

  // 导出为全局变量
  global.WordDB = WordDB;
})(window);
