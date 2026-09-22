/**
 * test.js — 检测流程控制器
 *
 * 两部分检测（英译中 + 中译英），记录错误，计算掌握状态。
 * 检测顺序：先所有词的英译中，再所有词的中译英。
 * 英译中用 checkMeaning（意思对即可），中译英用 checkExactMatch（精确匹配）。
 * 导出为全局变量 window.TestController。
 */

class TestController {
  constructor() {
    /** 检测队列：每个词两个方向（enToCn + cnToEn） */
    this.queue = [];
    /** 当前题目索引 */
    this.currentIndex = 0;
    /** 结果记录 */
    this.results = [];
    /** 今日学习的单词列表 */
    this.words = [];
    /** 是否正在监听语音 */
    this.isListening = false;
    /** 当前题是否已记录结果（防止重复处理） */
    this.resultRecorded = false;
  }

  /**
   * 开始检测
   * 获取今日学习过的所有单词，创建检测队列（先英译中再中译英），初始化结果记录
   */
  async start() {
    try {
      // 获取今日学习过的所有单词
      const schedule = await window.engine.getTodaySchedule(window.db);
      this.words = [...schedule.reviewWords, ...schedule.newWords];

      if (this.words.length === 0) {
        window.app.showToast('没有需要检测的单词', 'info');
        window.app.navigate('home');
        return;
      }

      // 创建检测队列：每个词两个方向（enToCn + cnToEn）
      // 先测所有词的英译中，再测所有词的中译英
      this.queue = [];
      this.words.forEach((word) => {
        this.queue.push({ word, direction: 'enToCn' });
      });
      this.words.forEach((word) => {
        this.queue.push({ word, direction: 'cnToEn' });
      });

      // 初始化结果记录
      this.currentIndex = 0;
      this.results = [];
      this.resultRecorded = false;

      // 导航到检测页面
      await window.app.navigate('test');

      // 显示第一题
      this.showCurrentQuestion();

      window.app.showToast(`共 ${this.queue.length} 道题，加油！`, 'info');
    } catch (err) {
      console.error('启动检测失败:', err);
      window.app.showToast('启动检测失败，请重试', 'error');
    }
  }

  /**
   * 显示当前题目
   * 更新进度、显示部分标识、显示题目内容、启动语音监听
   */
  showCurrentQuestion() {
    const item = this.queue[this.currentIndex];
    if (!item) return;

    const page = document.getElementById('page-test');
    if (!page) return;

    const { word, direction } = item;

    // 重置结果记录状态
    this.resultRecorded = false;

    // 更新进度
    const progressText = page.querySelector('.test-header span');
    if (progressText) {
      progressText.textContent = `${this.currentIndex + 1} / ${this.queue.length}`;
    }

    // 更新进度条
    const progressFill = page.querySelector('.test-progress-fill');
    if (progressFill) {
      const percent = ((this.currentIndex + 1) / this.queue.length) * 100;
      progressFill.style.width = percent + '%';
    }

    // 显示部分标识（第一部分/第二部分）
    const partBadge = page.querySelector('.part-badge');
    const partLabel = page.querySelector('.test-part-label');
    const wordEl = page.querySelector('.test-word');
    const instructionEl = page.querySelector('.test-instruction');

    if (direction === 'enToCn') {
      // 第一部分：英译中
      if (partBadge) partBadge.textContent = '第一部分 · 英译中';
      if (partLabel) partLabel.textContent = '请说出中文意思';
      if (wordEl) wordEl.textContent = word.english || '';
      if (instructionEl) instructionEl.textContent = '大声说出中文意思';
    } else {
      // 第二部分：中译英
      if (partBadge) partBadge.textContent = '第二部分 · 中译英';
      if (partLabel) partLabel.textContent = '请说出英文';
      if (wordEl) wordEl.textContent = word.chinese || '';
      if (instructionEl) instructionEl.textContent = '大声说出英文（需与库中一致）';
    }

    // 重置麦克风状态
    const micBtn = page.querySelector('.mic-btn');
    if (micBtn) micBtn.classList.remove('mic-btn--active');

    const micLabel = page.querySelector('.mic-label');
    if (micLabel) {
      micLabel.textContent = '点击麦克风开始作答';
      micLabel.style.color = 'var(--wb-muted-foreground)';
    }

    // 重置跳过按钮文本
    const skipBtn = page.querySelector('[data-dom-id="skip-word"]');
    if (skipBtn) {
      skipBtn.textContent = '跳过本题';
      skipBtn.style.color = 'var(--wb-muted-foreground)';
    }

    // 启动语音监听
    this.startListening();
  }

  /**
   * 开始语音监听
   * 检查语音支持，根据方向设置语言，开始监听识别结果
   */
  startListening() {
    const page = document.getElementById('page-test');
    if (!page) return;

    // 检查语音支持
    if (!window.voice.isSupported()) {
      const warningBanner = page.querySelector('.warning-banner');
      if (warningBanner) warningBanner.style.display = '';

      if (window.voice.isWeChatBrowser()) {
        window.voice.showWeChatNotice();
      }
      return;
    }

    // 隐藏警告横幅
    const warningBanner = page.querySelector('.warning-banner');
    if (warningBanner) warningBanner.style.display = 'none';

    // 设置监听状态
    this.isListening = true;

    // 添加录音动画
    const micBtn = page.querySelector('.mic-btn');
    if (micBtn) micBtn.classList.add('mic-btn--active');

    const micLabel = page.querySelector('.mic-label');
    if (micLabel) {
      micLabel.textContent = '正在聆听...';
      micLabel.style.color = 'var(--wb-muted-foreground)';
    }

    // 当前题目
    const item = this.queue[this.currentIndex];
    if (!item) return;

    // 根据方向设置识别语言
    // 英译中：学生说中文，用 zh-CN
    // 中译英：学生说英文，用 en-US
    const lang = item.direction === 'enToCn' ? 'zh-CN' : 'en-US';

    window.voice.startListening({
      lang,
      onResult: (text) => {
        if (text && text.trim()) {
          this.handleVoiceResult(text);
        }
      },
      onEnd: () => {
        // 如果还在检测页面且未记录结果，自动重启监听
        if (this.isListening && !this.resultRecorded) {
          setTimeout(() => {
            if (this.isListening && !this.resultRecorded) {
              this.startListening();
            }
          }, 500);
        }
      },
      onError: (err) => {
        console.error('语音识别错误:', err);
        this.isListening = false;

        if (micBtn) micBtn.classList.remove('mic-btn--active');
        if (micLabel) {
          micLabel.textContent = '语音识别出错，请重试';
          micLabel.style.color = 'var(--state-error)';
        }
      }
    });
  }

  /**
   * 处理语音识别结果
   * 第一部分：voice.checkMeaning（意思对即可）
   * 第二部分：voice.checkExactMatch（精确匹配）
   * 显示判断结果，记录结果，显示"下一个"按钮
   */
  async handleVoiceResult(spokenText) {
    // 防止重复处理
    if (this.resultRecorded) return;
    this.resultRecorded = true;

    // 停止监听
    this.isListening = false;
    window.voice.stopListening();

    const item = this.queue[this.currentIndex];
    if (!item) return;

    const { word, direction } = item;

    let result;
    let correctAnswer;

    if (direction === 'enToCn') {
      // 第一部分：英译中，checkMeaning（意思对即可）
      result = window.voice.checkMeaning(spokenText, word.chinese);
      correctAnswer = word.chinese;
    } else {
      // 第二部分：中译英，checkExactMatch（精确匹配）
      result = window.voice.checkExactMatch(spokenText, word.english);
      correctAnswer = word.english;
    }

    // 显示判断结果（正确/错误）
    this.showJudgment(result.correct, spokenText, correctAnswer);

    // 记录结果
    await this.recordResult(word, direction, result.correct, spokenText);
  }

  /**
   * 显示判断结果
   * 更新麦克风区域显示正确/错误，更新跳过按钮为"下一题"
   */
  showJudgment(correct, userAnswer, correctAnswer) {
    const page = document.getElementById('page-test');
    if (!page) return;

    // 移除录音动画
    const micBtn = page.querySelector('.mic-btn');
    if (micBtn) micBtn.classList.remove('mic-btn--active');

    // 更新麦克风标签显示判断结果
    const micLabel = page.querySelector('.mic-label');
    if (micLabel) {
      if (correct) {
        micLabel.textContent = '回答正确！';
        micLabel.style.color = 'var(--state-success)';
      } else {
        micLabel.textContent = `不正确。正确答案：${correctAnswer}`;
        micLabel.style.color = 'var(--state-error)';
      }
    }

    // 将跳过按钮变为"下一题"按钮
    const skipBtn = page.querySelector('[data-dom-id="skip-word"]');
    if (skipBtn) {
      skipBtn.textContent = '下一题';
      skipBtn.style.color = 'var(--wb-primary)';
      skipBtn.style.fontWeight = '600';
    }
  }

  /**
   * 记录结果
   * 正确：engine.markCorrect，更新 directionMastery
   * 错误：engine.markWrong，addErrorRecord
   * 如果 engine.isMastered：status = 'mastered'
   */
  async recordResult(word, direction, correct, userAnswer) {
    const correctAnswer = direction === 'enToCn' ? word.chinese : word.english;

    // 记录到结果列表
    this.results.push({
      wordId: word.id,
      word: word,
      direction,
      correct,
      userAnswer,
      correctAnswer
    });

    try {
      if (correct) {
        // 正确：engine.markCorrect，推进阶段，更新 directionMastery
        window.engine.markCorrect(word);

        // 确保 directionMastery 存在
        if (!word.directionMastery) {
          word.directionMastery = { enToCn: false, cnToEn: false };
        }
        word.directionMastery[direction] = true;

        // 如果两个方向都正确，标记为已掌握
        if (window.engine.isMastered(word)) {
          word.status = 'mastered';
        }
      } else {
        // 错误：engine.markWrong，重置阶段，status='error'
        window.engine.markWrong(word, direction);

        // 加入错题库
        await window.db.addErrorRecord(word.id, direction, userAnswer, correctAnswer);
      }

      // 保存到数据库
      await window.db.updateWord(word.id, {
        status: word.status,
        directionMastery: word.directionMastery,
        ebbinghausStage: word.ebbinghausStage,
        nextReview: word.nextReview
      });
    } catch (err) {
      console.error('记录检测结果失败:', err);
    }
  }

  /**
   * 下一题
   * 如果还有题，showCurrentQuestion()，如果全部完成，showResult()
   */
  nextQuestion() {
    this.currentIndex++;

    if (this.currentIndex < this.queue.length) {
      this.showCurrentQuestion();
    } else {
      this.showResult();
    }
  }

  /**
   * 显示检测结果
   * 计算总分，统计方向正确数，获取错题和已掌握列表，渲染到 test-result 页面
   */
  async showResult() {
    try {
      // 计算总分
      const total = this.results.length;
      const correctCount = this.results.filter((r) => r.correct).length;
      const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;

      // 统计英译中正确数/中译英正确数
      const enToCnResults = this.results.filter((r) => r.direction === 'enToCn');
      const cnToEnResults = this.results.filter((r) => r.direction === 'cnToEn');
      const enToCnCorrect = enToCnResults.filter((r) => r.correct).length;
      const cnToEnCorrect = cnToEnResults.filter((r) => r.correct).length;

      // 获取错题列表
      const errorList = this.results.filter((r) => !r.correct);

      // 获取已掌握列表（含下次复习日期）
      const masteredWords = this.words.filter((w) => window.engine.isMastered(w));

      // 导航到 test-result 页面
      await window.app.navigate('test-result');

      // 渲染结果
      const page = document.getElementById('page-test-result');
      if (!page) return;

      // 更新分数
      const scoreValue = page.querySelector('.score-value');
      if (scoreValue) scoreValue.textContent = `${correctCount}/${total}`;

      const scoreLabel = page.querySelector('.score-label');
      if (scoreLabel) scoreLabel.textContent = `正确率 ${score}%`;

      // 更新统计卡片（答对/答错）
      const statNumbers = page.querySelectorAll('.stat-number');
      if (statNumbers.length >= 2) {
        statNumbers[0].textContent = String(correctCount);
        statNumbers[1].textContent = String(total - correctCount);
      }

      // 更新方向拆分
      const directionResults = page.querySelectorAll('.direction-result');
      if (directionResults.length >= 2) {
        directionResults[0].innerHTML =
          `<span style="color: var(--state-success); font-weight: 600;">${enToCnCorrect}</span> / ${enToCnResults.length}`;
        directionResults[1].innerHTML =
          `<span style="color: var(--state-success); font-weight: 600;">${cnToEnCorrect}</span> / ${cnToEnResults.length}`;
      }

      // 渲染错题列表
      this.renderErrorList(page, errorList);

      // 渲染已掌握列表
      this.renderMasteredList(page, masteredWords);

      // 更新错题数量徽章
      const errorBadge = page.querySelector('.section-header .badge');
      if (errorBadge) errorBadge.textContent = `${errorList.length}题`;

      // 更新已掌握数量徽章
      const masteredBadge = page.querySelector('.mastered-section-header .badge');
      if (masteredBadge) masteredBadge.textContent = `${masteredWords.length}题`;

      // 保存学习记录（更新 testScore）
      await window.db.saveStudySession({
        date: Date.now(),
        newWords: 0,
        reviewWords: 0,
        testScore: score,
        errors: errorList.length
      });

      // 重新渲染图标
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('显示检测结果失败:', err);
      window.app.showToast('加载检测结果失败', 'error');
    }
  }

  /**
   * 渲染错题列表到检测结果页
   */
  renderErrorList(page, errorList) {
    const errorListContainer = page.querySelector('.error-list');
    if (!errorListContainer) return;

    if (errorList.length === 0) {
      errorListContainer.innerHTML =
        '<div style="text-align:center;padding:1.5rem;color:var(--wb-muted-foreground);font-size:0.875rem;">没有错题，太棒了！</div>';
      return;
    }

    // 构建错题卡片 HTML
    const html = errorList.map((result) => {
      const word = result.word;
      const correctAnswer = result.correctAnswer;
      const userAnswer = result.userAnswer;
      const reviewDate = this.getNextReviewDate(word);

      return `
        <div class="error-card">
          <div class="error-card-row">
            <div class="error-card-content">
              <div class="error-word">${this.escapeHtml(word.english)}</div>
              <div class="error-correct">正确答案：${this.escapeHtml(correctAnswer)}</div>
              <div class="error-user-answer">
                <span class="error-user-label">你的回答：</span>
                <span class="error-user-value">${this.escapeHtml(userAnswer)}</span>
              </div>
            </div>
            <span class="badge badge-primary">${reviewDate}</span>
          </div>
        </div>
      `;
    }).join('');

    errorListContainer.innerHTML = html;
  }

  /**
   * 渲染已掌握列表到检测结果页
   */
  renderMasteredList(page, masteredWords) {
    // 已掌握列表使用第二个 .error-list 容器
    const errorLists = page.querySelectorAll('.error-list');
    const masteredContainer = errorLists.length >= 2 ? errorLists[1] : null;
    if (!masteredContainer) return;

    if (masteredWords.length === 0) {
      masteredContainer.innerHTML =
        '<div style="text-align:center;padding:1.5rem;color:var(--wb-muted-foreground);font-size:0.875rem;">还没有已掌握的单词</div>';
      return;
    }

    // 构建已掌握卡片 HTML
    const html = masteredWords.map((word) => {
      const reviewDate = this.getNextReviewDate(word);
      return `
        <div class="mastered-card">
          <div class="mastered-card-row">
            <div class="mastered-card-content">
              <div class="mastered-word">${this.escapeHtml(word.english)}</div>
              <div class="mastered-cn">${this.escapeHtml(word.chinese)}</div>
            </div>
            <span class="badge badge-success">${reviewDate}</span>
          </div>
        </div>
      `;
    }).join('');

    masteredContainer.innerHTML = html;
  }

  /**
   * 获取已掌握单词的下次复习日期
   * 根据 ebbinghausStage 返回天数，格式为 "X天后复习"
   */
  getNextReviewDate(word) {
    const stage = word.ebbinghausStage || 0;
    const stages = window.engine.stages; // [1, 2, 4, 7, 15]

    if (stage >= stages.length) {
      return '已全部复习';
    }

    const days = stages[stage];
    if (days === 1) {
      return '明天复习';
    }
    return `${days}天后复习`;
  }

  /**
   * 跳过当前题目（不计入结果）
   */
  skipQuestion() {
    // 停止监听
    this.isListening = false;
    window.voice.stopListening();

    // 记录为错误（跳过视为答错）
    const item = this.queue[this.currentIndex];
    if (item && !this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(item.word, item.direction, false, '（跳过）').then(() => {
        this.nextQuestion();
      });
    } else {
      this.nextQuestion();
    }
  }

  /**
   * 退出检测
   */
  exit() {
    const confirmed = window.confirm('确定要退出检测吗？进度不会保存。');
    if (confirmed) {
      this.isListening = false;
      window.voice.stopListening();
      window.app.navigate('home');
    }
  }

  /**
   * HTML 转义，防止 XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

// 导出为全局变量
window.TestController = TestController;
