/**
 * voice.js — 语音识别封装
 * 封装 Web Speech Recognition API，用于单词发音检测和语音答题。
 * 支持微信内置浏览器检测、中文意思模糊匹配、英文精确匹配。
 * 导出为全局变量 window.VoiceController。
 */

(function (global) {
  'use strict';

  /**
   * VoiceController — 语音识别控制器
   * 封装浏览器 SpeechRecognition API，提供中英文语音识别和答案匹配功能
   */
  function VoiceController() {
    this.recognition = null;
    this._noticeElement = null;
    this._noticeId = 'wb-wechat-notice';
  }

  /**
   * 检测浏览器是否支持语音识别
   * @returns {boolean}
   */
  VoiceController.prototype.isSupported = function () {
    return !!(
      global.SpeechRecognition ||
      global.webkitSpeechRecognition ||
      global.mozSpeechRecognition ||
      global.msSpeechRecognition
    );
  };

  /**
   * 检测是否在微信内置浏览器中
   * @returns {boolean}
   */
  VoiceController.prototype.isWeChatBrowser = function () {
    var ua = navigator.userAgent || '';
    return ua.indexOf('MicroMessenger') !== -1;
  };

  /**
   * 开始监听
   * @param {Object} options - 监听配置
   * @param {string} options.lang - 语言 'zh-CN' 或 'en-US'
   * @param {Function} options.onResult - 实时识别结果回调 (text) => void
   * @param {Function} options.onEnd - 识别结束回调 () => void
   * @param {Function} options.onError - 错误回调 (err) => void
   * @param {boolean} options.continuous - 是否连续识别
   * @param {boolean} options.interimResults - 是否返回临时结果
   * @returns {SpeechRecognition} recognition 实例
   */
  VoiceController.prototype.startListening = function (options) {
    var self = this;
    options = options || {};

    // 获取 SpeechRecognition 构造函数
    var SR =
      global.SpeechRecognition ||
      global.webkitSpeechRecognition ||
      global.mozSpeechRecognition ||
      global.msSpeechRecognition;

    if (!SR) {
      // 不支持语音识别，显示提示
      this.showWeChatNotice();
      if (options.onError) {
        options.onError(new Error('当前浏览器不支持语音识别'));
      }
      return null;
    }

    // 创建识别实例
    var recognition = new SR();
    recognition.lang = options.lang || 'zh-CN';
    recognition.continuous = options.continuous !== undefined ? options.continuous : true;
    recognition.interimResults =
      options.interimResults !== undefined ? options.interimResults : true;

    // 识别结果回调
    recognition.onresult = function (event) {
      var finalText = '';
      var interimText = '';

      for (var i = event.resultIndex; i < event.results.length; i++) {
        var transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      // 优先返回最终结果，否则返回临时结果
      var resultText = finalText || interimText;
      if (resultText && options.onResult) {
        options.onResult(resultText.trim());
      }
    };

    // 识别结束回调
    recognition.onend = function () {
      if (options.onEnd) {
        options.onEnd();
      }
    };

    // 错误处理
    recognition.onerror = function (event) {
      var errMsg = '';
      switch (event.error) {
        case 'no-speech':
          errMsg = '没有检测到语音输入';
          break;
        case 'audio-capture':
          errMsg = '麦克风无法捕获音频';
          break;
        case 'not-allowed':
        case 'service-not-allowed':
          errMsg = '请允许使用麦克风权限';
          break;
        case 'network':
          errMsg = '网络错误，语音识别需要网络连接';
          break;
        case 'aborted':
          errMsg = '语音识别已中止';
          break;
        default:
          errMsg = '语音识别错误: ' + (event.error || '未知');
      }
      console.error('[VoiceController] 语音识别错误:', errMsg);
      if (options.onError) {
        options.onError(new Error(errMsg));
      }
    };

    // 开始识别
    try {
      recognition.start();
    } catch (e) {
      // 可能已在运行，先停止再启动
      try {
        recognition.stop();
      } catch (e2) {}
      recognition.start();
    }

    this.recognition = recognition;
    return recognition;
  };

  /**
   * 停止监听
   */
  VoiceController.prototype.stopListening = function () {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        console.warn('[VoiceController] 停止识别时出错:', e);
      }
      this.recognition = null;
    }
  };

  /**
   * 判断中文意思是否正确（意思对即可，不需要完全匹配）
   * 使用关键词模糊匹配策略
   * @param {string} spokenText - 用户说出的话
   * @param {string} targetChinese - 正确的中文
   * @returns {{correct: boolean, confidence: number, matchedText: string}}
   */
  VoiceController.prototype.checkMeaning = function (spokenText, targetChinese) {
    if (!spokenText || !targetChinese) {
      return { correct: false, confidence: 0, matchedText: '' };
    }

    var spoken = spokenText.trim();
    var target = targetChinese.trim();

    // 情况1: 完全包含
    if (spoken.indexOf(target) !== -1) {
      return { correct: true, confidence: 1.0, matchedText: target };
    }

    // 情况2: spoken 包含 target（反向）
    if (target.indexOf(spoken) !== -1 && spoken.length >= target.length * 0.5) {
      return { correct: true, confidence: 0.8, matchedText: spoken };
    }

    // 情况3: 提取关键词进行匹配
    // 将 target 拆成 2-3 字的片段，检查 spoken 是否包含
    var keywords = this._extractKeywords(target);
    var matchedKeywords = [];
    var matchCount = 0;

    for (var i = 0; i < keywords.length; i++) {
      if (spoken.indexOf(keywords[i]) !== -1) {
        matchCount++;
        matchedKeywords.push(keywords[i]);
      }
    }

    // 关键词匹配率 >= 50% 视为正确
    if (keywords.length > 0) {
      var matchRatio = matchCount / keywords.length;
      if (matchRatio >= 0.5) {
        return {
          correct: true,
          confidence: Math.round(matchRatio * 100) / 100,
          matchedText: matchedKeywords.join(''),
        };
      }
    }

    // 情况4: 编辑距离相似度
    var similarity = this._editDistanceSimilarity(spoken, target);
    if (similarity >= 0.6) {
      return {
        correct: true,
        confidence: similarity,
        matchedText: spoken,
      };
    }

    return { correct: false, confidence: similarity, matchedText: '' };
  };

  /**
   * 判断英文是否精确匹配
   * - 全部转小写
   * - 去除标点和多余空格
   * - 精确比较（支持短语中词序容忍）
   * @param {string} spokenText - 用户说出的话
   * @param {string} targetEnglish - 正确的英文
   * @returns {{correct: boolean, confidence: number, matchedText: string}}
   */
  VoiceController.prototype.checkExactMatch = function (spokenText, targetEnglish) {
    if (!spokenText || !targetEnglish) {
      return { correct: false, confidence: 0, matchedText: '' };
    }

    // 清理函数：转小写、去标点、压缩空格
    var cleanText = function (text) {
      return text
        .toLowerCase()
        .replace(/[^a-z\s]/g, '') // 只保留字母和空格
        .replace(/\s+/g, ' ')
        .trim();
    };

    var spoken = cleanText(spokenText);
    var target = cleanText(targetEnglish);

    // 情况1: 完全匹配
    if (spoken === target) {
      return { correct: true, confidence: 1.0, matchedText: spoken };
    }

    // 情况2: spoken 包含 target
    if (spoken.indexOf(target) !== -1) {
      return { correct: true, confidence: 0.95, matchedText: target };
    }

    // 情况3: target 包含 spoken
    if (target.indexOf(spoken) !== -1 && spoken.length >= 2) {
      return { correct: true, confidence: 0.85, matchedText: spoken };
    }

    // 情况4: 短语词序容忍 — 分词后排序比较
    var spokenWords = spoken.split(' ').filter(function (w) { return w.length > 0; });
    var targetWords = target.split(' ').filter(function (w) { return w.length > 0; });

    // 单词数相同才做词序容忍
    if (spokenWords.length === targetWords.length && spokenWords.length > 1) {
      var spokenSorted = spokenWords.slice().sort().join(' ');
      var targetSorted = targetWords.slice().sort().join(' ');

      if (spokenSorted === targetSorted) {
        return { correct: true, confidence: 0.9, matchedText: spoken };
      }
    }

    // 情况5: 单词部分匹配（所有 target 单词都在 spoken 中出现）
    if (targetWords.length > 1) {
      var allFound = true;
      for (var i = 0; i < targetWords.length; i++) {
        if (spoken.indexOf(targetWords[i]) === -1) {
          allFound = false;
          break;
        }
      }
      if (allFound) {
        return { correct: true, confidence: 0.8, matchedText: target };
      }
    }

    // 情况6: 编辑距离
    var similarity = this._editDistanceSimilarity(spoken, target);
    if (similarity >= 0.7) {
      return { correct: true, confidence: similarity, matchedText: spoken };
    }

    return { correct: false, confidence: similarity, matchedText: '' };
  };

  /**
   * 显示微信不支持提示
   * 在页面顶部显示提示条，告知用户在浏览器中打开
   */
  VoiceController.prototype.showWeChatNotice = function () {
    // 如果已有提示条则不重复创建
    if (document.getElementById(this._noticeId)) {
      return;
    }

    var notice = document.createElement('div');
    notice.id = this._noticeId;
    notice.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'z-index: 9999',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'gap: 8px',
      'padding: 12px 16px',
      'background-color: #0d9488',
      'color: #ffffff',
      'font-size: 14px',
      'font-family: "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
      'box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1)',
      'animation: wb-notice-slide-in 0.3s ease',
    ].join(';');

    // 图标
    var icon = document.createElement('span');
    icon.textContent = '\u26A0'; // 警告符号
    icon.style.fontSize = '18px';

    // 文字
    var text = document.createElement('span');
    text.textContent = '语音功能需在浏览器中打开使用。请点击右上角"···"→"在浏览器中打开"';

    // 关闭按钮
    var closeBtn = document.createElement('span');
    closeBtn.textContent = '\u00D7';
    closeBtn.style.cssText = [
      'margin-left: 8px',
      'font-size: 20px',
      'cursor: pointer',
      'opacity: 0.8',
      'flex-shrink: 0',
    ].join(';');
    closeBtn.onclick = function () {
      notice.style.display = 'none';
    };

    notice.appendChild(icon);
    notice.appendChild(text);
    notice.appendChild(closeBtn);

    // 添加滑入动画
    var styleEl = document.createElement('style');
    styleEl.textContent =
      '@keyframes wb-notice-slide-in { from { transform: translateY(-100%); } to { transform: translateY(0); } }';
    document.head.appendChild(styleEl);

    document.body.appendChild(notice);
    this._noticeElement = notice;
  };

  /**
   * 移除微信提示
   */
  VoiceController.prototype.hideWeChatNotice = function () {
    if (this._noticeElement && this._noticeElement.parentNode) {
      this._noticeElement.parentNode.removeChild(this._noticeElement);
    }
    this._noticeElement = null;

    // 也检查通过 id 获取的元素
    var existing = document.getElementById(this._noticeId);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  };

  // ==================== 内部工具方法 ====================

  /**
   * 从中文文本中提取关键词（2-3字片段）
   * @param {string} text - 中文文本
   * @returns {Array<string>} 关键词数组
   */
  VoiceController.prototype._extractKeywords = function (text) {
    if (!text) return [];

    // 按标点和空格分词
    var segments = text.split(/[，。、；：,.;:\s\n\r！？!?（）()\[\]【】]/);
    var keywords = [];

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i].trim();
      if (!seg) continue;

      if (seg.length <= 3) {
        // 短片段直接作为关键词
        keywords.push(seg);
      } else {
        // 长片段按2-3字滑动窗口提取
        for (var j = 0; j < seg.length - 1; j++) {
          keywords.push(seg.substring(j, j + 2));
        }
        // 也加入3字片段
        for (var k = 0; k < seg.length - 2; k++) {
          keywords.push(seg.substring(k, k + 3));
        }
      }
    }

    // 去重
    var unique = [];
    var seen = {};
    for (var m = 0; m < keywords.length; m++) {
      if (!seen[keywords[m]]) {
        seen[keywords[m]] = true;
        unique.push(keywords[m]);
      }
    }

    return unique;
  };

  /**
   * 计算编辑距离（Levenshtein Distance）
   * @param {string} s1 - 字符串1
   * @param {string} s2 - 字符串2
   * @returns {number} 编辑距离
   */
  VoiceController.prototype._editDistance = function (s1, s2) {
    if (s1 === s2) return 0;
    if (!s1) return s2.length;
    if (!s2) return s1.length;

    var len1 = s1.length;
    var len2 = s2.length;
    var prev = [];
    var curr = [];

    for (var j = 0; j <= len2; j++) {
      curr[j] = j;
    }

    for (var i = 1; i <= len1; i++) {
      prev = curr;
      curr = [];
      curr[0] = i;
      for (var k = 1; k <= len2; k++) {
        var cost = s1.charAt(i - 1) === s2.charAt(k - 1) ? 0 : 1;
        curr[k] = Math.min(
          prev[k] + 1,        // 删除
          curr[k - 1] + 1,    // 插入
          prev[k - 1] + cost  // 替换
        );
      }
    }

    return curr[len2];
  };

  /**
   * 基于编辑距离计算相似度 (0-1)
   * @param {string} s1 - 字符串1
   * @param {string} s2 - 字符串2
   * @returns {number} 相似度 0-1
   */
  VoiceController.prototype._editDistanceSimilarity = function (s1, s2) {
    if (!s1 && !s2) return 1;
    var maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;
    var distance = this._editDistance(s1, s2);
    return Math.round((1 - distance / maxLen) * 100) / 100;
  };

  // 导出为全局变量
  global.VoiceController = VoiceController;
})(window);
