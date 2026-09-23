/**
 * study.js — 学习流程控制器
 *
 * 管理逐词学习流程，包括复习词和新词的混合学习队列。
 * 每个单词需要朗读5遍才能进入下一个。
 * 使用语音识别监听朗读，进度点显示完成情况。
 * 导出为全局变量 window.StudyController。
 */

class StudyController {
  constructor() {
    /** 学习队列（复习词 + 新词混合） */
    this.queue = [];
    /** 当前学习的单词索引 */
    this.currentIndex = 0;
    /** 当前单词朗读计数（0-5） */
    this.readCount = 0;
    /** 学习开始时间戳 */
    this.studyStartTime = 0;
    /** 新词数量 */
    this.newWordsCount = 0;
    /** 复习词数量 */
    this.reviewWordsCount = 0;
    /** 是否正在监听语音 */
    this.isListening = false;
  }

  /**
   * 初始化今日学习
   * 获取今日学习列表，合并复习词和新词为学习队列，重置状态并显示学习页面
   */
  async start() {
    try {
      // 获取今日学习列表
      const schedule = await window.engine.getTodaySchedule(window.db);

      // 合并复习词和新词为学习队列
      this.queue = [...schedule.reviewWords, ...schedule.newWords];
      this.reviewWordsCount = schedule.reviewWords.length;
      this.newWordsCount = schedule.newWords.length;

      // 如果没有需要学习的单词
      if (this.queue.length === 0) {
        window.app.showToast('今日没有需要学习的单词', 'info');
        window.app.navigate('home');
        return;
      }

      // 重置当前索引、朗读计数
      this.currentIndex = 0;
      this.readCount = 0;
      this.studyStartTime = Date.now();
      this.isListening = false;

      // 导航到学习页面
      await window.app.navigate('study');

      // 显示第一个单词
      this.showCurrentWord();

      window.app.showToast(`今日共 ${this.queue.length} 个单词待学习`, 'success');
    } catch (err) {
      console.error('启动学习失败:', err);
      window.app.showToast('启动学习失败，请重试', 'error');
    }
  }

  /**
   * 显示当前单词
   * 更新进度、显示英文/音标/中文、重置朗读计数、更新进度点、启动语音监听
   */
  showCurrentWord() {
    const word = this.queue[this.currentIndex];
    if (!word) return;

    const page = document.getElementById('page-study');
    if (!page) return;

    // 更新进度：当前序号/总数
    const progressText = page.querySelector('#study-progress-text, .study-header span');
    if (progressText) {
      progressText.textContent = `${this.currentIndex + 1} / ${this.queue.length}`;
    }

    // 更新进度条
    const progressFill = page.querySelector('#study-progress-fill, .study-progress-fill');
    if (progressFill) {
      const percent = ((this.currentIndex + 1) / this.queue.length) * 100;
      progressFill.style.width = percent + '%';
    }

    // 显示英文（大字）、音标、中文 — 使用 HTML 中实际的 id
    const wordEl = page.querySelector('#study-word-en, .study-word-english');
    const chineseEl = page.querySelector('#study-word-cn, .study-word-chinese');
    const pronEl = page.querySelector('#study-word-pron, .study-word-pron');

    if (wordEl) wordEl.textContent = word.english || '';
    if (chineseEl) chineseEl.textContent = word.chinese || '';
    if (pronEl) {
      pronEl.textContent = word.pronunciation || '';
      pronEl.style.fontFamily = 'var(--wb-font-mono)';
    }

    // 重置朗读计数为 0
    this.readCount = 0;

    // 更新5个进度点（全部未完成）
    this.updateReadingDots();

    // 隐藏"下一个"按钮
    const nextArea = page.querySelector('#study-next-area, .study-next-area, .next-area');
    if (nextArea) nextArea.style.display = 'none';

    // 显示麦克风区域
    const micArea = page.querySelector('.study-mic-area, .mic-area');
    if (micArea) micArea.style.display = '';

    // 重置麦克风按钮状态
    const micBtn = page.querySelector('#study-mic-btn, .mic-btn');
    if (micBtn) micBtn.classList.remove('mic-btn--active');

    const micLabel = page.querySelector('#study-mic-label, .mic-label, .mic-area span');
    if (micLabel) {
      micLabel.textContent = '点击麦克风开始朗读';
      micLabel.style.color = 'var(--wb-muted-foreground)';
    }

    // 检查语音支持，决定是否显示手动按钮
    const manualArea = page.querySelector('#study-manual-area');
    if (manualArea) {
      if (window.voice && window.voice.isSupported()) {
        // 支持语音：隐藏手动按钮，等待用户点击麦克风
        manualArea.style.display = 'none';
        // 不自动启动监听，等用户点击麦克风
        this.isListening = false;
        const micLabel2 = page.querySelector('#study-mic-label');
        if (micLabel2) {
          micLabel2.textContent = '点击麦克风开始朗读';
          micLabel2.style.color = 'var(--wb-muted-foreground)';
        }
      } else {
        // 不支持语音：显示手动按钮，隐藏麦克风
        manualArea.style.display = '';
        if (micArea) micArea.style.display = 'none';
        if (micLabel) {
          micLabel.textContent = '语音功能不可用，请手动点击';
          micLabel.style.color = 'var(--wb-muted-foreground)';
        }
      }
    } else {
      // 没有手动按钮元素，不自动启动
      this.isListening = false;
    }
  }

  /**
   * 更新朗读进度点显示
   * 前 readCount 个为已完成（rdot--done），第 readCount 个为当前（rdot--current），其余为未完成
   */
  updateReadingDots() {
    const page = document.getElementById('page-study');
    if (!page) return;

    const dotsContainer = page.querySelector('#reading-dots-row, .reading-dots-row');
    if (!dotsContainer) return;

    const dots = dotsContainer.querySelectorAll('.rdot');
    dots.forEach((dot, i) => {
      // 清除所有状态类
      dot.classList.remove('rdot--done', 'rdot--current');
      if (i < this.readCount) {
        // 已完成
        dot.classList.add('rdot--done');
      } else if (i === this.readCount && this.readCount < 5) {
        // 当前
        dot.classList.add('rdot--current');
      }
    });

    // 更新朗读计数文本 — 使用 HTML 中实际的 id
    const readingText = page.querySelector('#reading-count-text, .reading-dots-text');
    if (readingText) {
      readingText.textContent = `朗读 ${this.readCount}/5 遍`;
    }
  }

  /**
   * 开始朗读监听
   * 检查语音支持，不支持时显示微信提示，支持时开始监听
   */
  startListening() {
    const page = document.getElementById('page-study');
    if (!page) return;

    // 检查语音支持
    if (!window.voice.isSupported()) {
      // 显示微信提示
      const warningBanner = page.querySelector('.warning-banner');
      if (warningBanner) warningBanner.style.display = '';

      // 如果在微信浏览器中
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

    // 更新麦克风按钮状态（添加录音动画）
    const micBtn = page.querySelector('#study-mic-btn, .mic-btn');
    if (micBtn) micBtn.classList.add('mic-btn--active');

    // 更新麦克风标签
    const micLabel = page.querySelector('#study-mic-label, .mic-label');
    if (micLabel) {
      micLabel.textContent = '正在聆听...';
      micLabel.style.color = 'var(--wb-muted-foreground)';
    }

    // 当前显示的单词
    const word = this.queue[this.currentIndex];
    if (!word) return;

    // 朗读时监听中文（学生读出单词的中文意思或英文）
    // 这里使用中文识别，因为学生需要朗读单词
    window.voice.startListening({
      lang: 'zh-CN',
      onResult: (text) => {
        // 每次识别到朗读内容（不为空），增加朗读计数
        if (text && text.trim()) {
          this.incrementReadCount();
        }
      },
      onEnd: () => {
        // 语音识别结束后，如果还在学习且未完成5遍，自动重启监听
        if (this.isListening && this.readCount < 5) {
          setTimeout(() => {
            if (this.isListening && this.readCount < 5) {
              this.startListening();
            }
          }, 500);
        }
      },
      onError: (err) => {
        console.error('语音识别错误:', err);
        this.isListening = false;

        // 恢复按钮状态
        if (micBtn) micBtn.classList.remove('mic-btn--active');
        if (micLabel) {
          micLabel.textContent = '语音识别出错，请重试';
          micLabel.style.color = 'var(--state-error)';
        }
      }
    });
  }

  /**
   * 朗读计数增加
   * readCount++，更新进度点，达到5时完成当前词
   */
  incrementReadCount() {
    // 如果已经达到5，不再增加
    if (this.readCount >= 5) return;

    this.readCount++;

    // 更新进度点显示
    this.updateReadingDots();

    // 如果朗读计数达到5，完成当前词
    if (this.readCount >= 5) {
      this.onReadingComplete();
    }
  }

  /**
   * 朗读完成（5遍），准备进入下一个
   * 停止监听，显示"下一个"按钮
   */
  onReadingComplete() {
    // 停止监听
    this.isListening = false;
    window.voice.stopListening();

    const page = document.getElementById('page-study');
    if (!page) return;

    // 移除麦克风录音动画
    const micBtn = page.querySelector('#study-mic-btn, .mic-btn');
    if (micBtn) micBtn.classList.remove('mic-btn--active');

    // 隐藏手动按钮
    const manualArea = page.querySelector('#study-manual-area');
    if (manualArea) manualArea.style.display = 'none';

    // 更新麦克风标签
    const micLabel = page.querySelector('#study-mic-label, .mic-label');
    if (micLabel) {
      micLabel.textContent = '朗读完成！';
      micLabel.style.color = 'var(--state-success)';
    }

    // 显示"下一个"按钮
    const nextArea = page.querySelector('#study-next-area, .study-next-area');
    if (nextArea) nextArea.style.display = '';

    // 更新所有进度点为已完成
    const dots = page.querySelectorAll('.rdot');
    dots.forEach((dot) => {
      dot.classList.remove('rdot--current');
      dot.classList.add('rdot--done');
    });

    // 更新朗读文本
    const readingText = page.querySelector('#reading-count-text, .reading-dots-text');
    if (readingText) {
      readingText.textContent = '朗读完成 5/5 遍';
    }

    // 1.5秒后自动跳转到下一个单词
    setTimeout(() => {
      this.completeCurrentWord();
    }, 1500);
  }

  /**
   * 完成当前单词
   * 如果是新词则 status 改为 'learning'，更新 lastReview，移动到队列下一个
   */
  async completeCurrentWord() {
    const word = this.queue[this.currentIndex];
    if (!word) return;

    try {
      // 如果是新词，status 改为 'learning'
      if (word.status === 'new' || !word.status) {
        word.status = 'learning';
      }

      // 更新 lastReview
      word.lastReview = Date.now();

      // 保存到数据库
      await window.db.updateWord(word.id, {
        status: word.status,
        lastReview: word.lastReview
      });

      // 移动到队列下一个
      this.currentIndex++;

      // 如果还有词，显示下一个
      if (this.currentIndex < this.queue.length) {
        this.showCurrentWord();
      } else {
        // 如果全部完成，显示学习完成
        await this.showComplete();
      }
    } catch (err) {
      console.error('完成单词失败:', err);
      window.app.showToast('保存学习进度失败', 'error');
    }
  }

  /**
   * 显示学习完成
   * 隐藏学习页，显示学习完成页，统计学习数量，保存学习记录
   */
  async showComplete() {
    try {
      // 计算学习时长（分钟）
      const totalTime = Math.max(1, Math.round((Date.now() - this.studyStartTime) / 60000));
      const totalWords = this.queue.length;

      // 保存学习记录到 db.saveStudySession
      await window.db.saveStudySession({
        date: Date.now(),
        newWords: this.newWordsCount,
        reviewWords: this.reviewWordsCount,
        testScore: 0,
        errors: 0
      });

      // 导航到 study-complete 页面
      await window.app.navigate('study-complete');

      // 更新学习完成页的统计数据
      const page = document.getElementById('page-study-complete');
      if (page) {
        const statValues = page.querySelectorAll('.stat-value');
        // 第一个：学习了多少个单词
        if (statValues[0]) statValues[0].textContent = String(totalWords);
        // 第二个：学习时长（分钟）
        if (statValues[1]) statValues[1].textContent = String(totalTime);
        // 第三个：朗读完成
        if (statValues[2]) statValues[2].textContent = '5/5';
      }

      window.app.showToast('学习完成！', 'success');
    } catch (err) {
      console.error('显示学习完成页失败:', err);
      window.app.showToast('加载完成页面失败', 'error');
    }
  }

  /**
   * 跳过当前单词
   * 直接移动到下一个，不记录朗读完成
   */
  skipWord() {
    // 停止监听
    this.isListening = false;
    window.voice.stopListening();

    // 移动到队列下一个
    this.currentIndex++;

    if (this.currentIndex < this.queue.length) {
      this.showCurrentWord();
    } else {
      this.showComplete();
    }
  }

  /**
   * 退出学习
   * 确认退出后返回首页
   */
  exit() {
    // 确认退出
    const confirmed = window.confirm('确定要退出学习吗？进度不会保存。');
    if (confirmed) {
      // 停止监听
      this.isListening = false;
      window.voice.stopListening();

      // 返回首页
      window.app.navigate('home');
    }
  }
}

// 导出为全局变量
window.StudyController = StudyController;
