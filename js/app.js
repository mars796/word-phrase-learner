/**
 * app.js — 主控制器 + SPA 路由
 *
 * 入口文件，初始化所有模块并管理路由。
 * 负责：SPA 页面切换、底部导航、事件绑定、数据渲染、Toast/Loading 等。
 * 导出为全局变量 window.app。
 *
 * 注意：页面 HTML 已内联在 index.html 中，通过 .active 类切换显示。
 */

const App = {
  /* === 属性 === */
  db: null,
  engine: null,
  voice: null,
  ocr: null,
  study: null,
  test: null,
  stats: null,
  currentPage: 'home',

  /** 有底部导航的页面 */
  pagesWithNav: ['home', 'library', 'error-book', 'stats'],

  /** 添加单词页的已识别单词列表 */
  _recognizedWords: [],

  /* === 初始化 === */

  /**
   * 初始化应用
   * 初始化数据库、引擎、控制器，绑定事件，加载首页数据
   */
  async init() {
    try {
      // 1. 初始化数据库和引擎
      this.db = new WordDB();
      await this.db.init();
      window.db = this.db;

      this.engine = new EbbinghausEngine();
      window.engine = this.engine;

      this.voice = new VoiceController();
      window.voice = this.voice;

      this.ocr = new OCRController();
      window.ocr = this.ocr;

      // 2. 初始化各控制器
      this.study = new StudyController();
      window.study = this.study;

      this.test = new TestController();
      window.test = this.test;

      this.stats = new StatsController();
      window.stats = this.stats;

      // 3. 绑定事件
      this.bindEvents();

      // 4. 渲染 Lucide 图标
      if (window.lucide) {
        lucide.createIcons();
      }

      // 5. 显示首页
      this.navigate('home');

      // 6. 如果数据库为空，添加示例单词
      await this.seedSampleData();

      await this.renderHome();

      // 7. 检测微信环境，显示提示
      if (this.voice.isWeChatBrowser()) {
        this.voice.showWeChatNotice();
      }

      console.log('✅ 应用初始化完成');
    } catch (err) {
      console.error('应用初始化失败:', err);
      // 在页面显示错误提示
      var errDiv = document.createElement('div');
      errDiv.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'text-align:center;padding:2rem;font-family:sans-serif;z-index:9999;';
      errDiv.innerHTML =
        '<p style="font-size:1.25rem;font-weight:600;margin-bottom:0.5rem;">应用初始化失败</p>' +
        '<p style="color:#78716c;font-size:0.875rem;">' +
        (err.message || '未知错误') + '</p>';
      document.body.appendChild(errDiv);
    }
  },

  /* === 路由 === */

  /**
   * 导航到指定页面
   * 移除所有 .page 的 .active 类，给目标页面添加 .active
   * 处理底部导航的显隐和 active 状态
   */
  async navigate(pageId) {
    // 隐藏所有 .page
    var pages = document.querySelectorAll('.page');
    pages.forEach(function (p) {
      p.classList.remove('active');
    });

    // 显示目标页面
    var targetPage = document.getElementById('page-' + pageId);
    if (targetPage) {
      targetPage.classList.add('active');

      // 淡入动画
      targetPage.style.opacity = '0';
      targetPage.style.transition = 'opacity 0.3s ease';
      requestAnimationFrame(function () {
        targetPage.style.opacity = '1';
      });
    }

    this.currentPage = pageId;

    // 处理底部导航
    var bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) {
      if (this.pagesWithNav.indexOf(pageId) !== -1) {
        // 导航页：显示底部导航并更新 active
        bottomNav.style.display = '';
        this.updateNavActive(pageId);
      } else {
        // 非导航页：隐藏底部导航
        bottomNav.style.display = 'none';
      }
    }

    // 调用页面显示回调
    await this.onPageShow(pageId);

    // 重新渲染 Lucide 图标
    if (window.lucide) {
      lucide.createIcons();
    }
  },

  /**
   * 更新底部导航的 active 状态
   */
  updateNavActive(pageId) {
    var navItems = document.querySelectorAll('#bottom-nav .nav-item');
    navItems.forEach(function (item) {
      var isActive = item.getAttribute('data-nav') === pageId;
      if (isActive) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  },

  /**
   * 页面显示时的回调
   * 根据页面 ID 调用对应的渲染方法
   */
  async onPageShow(pageId) {
    switch (pageId) {
      case 'home':
        await this.renderHome();
        break;
      case 'library':
        await this.renderLibrary();
        break;
      case 'error-book':
        await this.renderErrorBook();
        break;
      case 'stats':
        await this.renderStats();
        break;
    }

    // 重新渲染 Lucide 图标
    if (window.lucide) {
      lucide.createIcons();
    }
  },

  /* === 示例数据 === */

  /**
   * 如果数据库为空，添加示例单词供用户测试
   */
  async seedSampleData() {
    try {
      var words = await this.db.getAllWords();
      if (words.length > 0) return; // 已有数据，不添加

      var samples = [
        { english: 'apple', chinese: '苹果', phonetic: '/ˈæpl/' },
        { english: 'beautiful', chinese: '美丽的', phonetic: '/ˈbjuːtɪfl/' },
        { english: 'run', chinese: '跑', phonetic: '/rʌn/' },
        { english: 'happy', chinese: '快乐的', phonetic: '/ˈhæpi/' },
        { english: 'school', chinese: '学校', phonetic: '/skuːl/' },
        { english: 'friend', chinese: '朋友', phonetic: '/frend/' },
        { english: 'book', chinese: '书', phonetic: '/bʊk/' },
        { english: 'water', chinese: '水', phonetic: '/ˈwɔːtər/' }
      ];

      for (var i = 0; i < samples.length; i++) {
        var s = samples[i];
        await this.db.addWord(s.english, s.chinese, s.phonetic, 'manual');
      }

      console.log('✅ 已添加 ' + samples.length + ' 个示例单词');
    } catch (err) {
      console.error('添加示例数据失败:', err);
    }
  },

  /* === 页面渲染 === */

  /**
   * 渲染首页
   * 获取今日复习/新增数量，渲染学习概览和进度
   */
  async renderHome() {
    var page = document.getElementById('page-home');
    if (!page) return;

    try {
      // 获取今日学习列表
      var schedule = await this.engine.getTodaySchedule(this.db);
      var newCount = schedule.newWords.length;
      var reviewCount = schedule.reviewWords.length;

      // 获取错题数
      var errorWords = await this.db.getErrorWords();
      var errorCount = errorWords.length;

      // 获取掌握统计
      var masteryStats = await this.db.getMasteryStats();
      var total = masteryStats.total || 0;

      // 更新日期显示
      var dateEl = page.querySelector('.home-date');
      if (dateEl) {
        var now = new Date();
        var months = ['1月', '2月', '3月', '4月', '5月', '6月',
          '7月', '8月', '9月', '10月', '11月', '12月'];
        var days = ['星期日', '星期一', '星期二', '星期三',
          '星期四', '星期五', '星期六'];
        dateEl.textContent =
          months[now.getMonth()] + now.getDate() + '日 ' + days[now.getDay()];
      }

      // 更新新词数量
      var newCountEl = page.querySelector('#home-new-count');
      if (newCountEl) newCountEl.textContent = newCount;

      // 更新复习数量
      var reviewCountEl = page.querySelector('#home-review-count');
      if (reviewCountEl) reviewCountEl.textContent = reviewCount;

      // 更新进度总数
      var totalTasks = newCount + reviewCount;
      var totalEl = page.querySelector('#home-progress-total');
      if (totalEl) totalEl.textContent = totalTasks;

      // 更新错题数（如果有对应元素）
      var errorCountEl = page.querySelector('#home-error-count');
      if (errorCountEl) errorCountEl.textContent = errorCount;

    } catch (err) {
      console.error('渲染首页失败:', err);
    }
  },

  /**
   * 渲染词库页面
   * 获取所有单词，渲染列表
   */
  async renderLibrary() {
    var page = document.getElementById('page-library');
    if (!page) return;

    try {
      var words = await this.db.getAllWords();

      // 更新数量
      var countEl = page.querySelector('.lib-count');
      if (countEl) countEl.textContent = '共 ' + words.length + ' 词';

      // 渲染单词列表
      var listContainer = page.querySelector('.lib-list');
      if (!listContainer) return;

      if (words.length === 0) {
        listContainer.innerHTML =
          '<div style="text-align:center;padding:3rem 1rem;color:var(--wb-muted-foreground);">' +
          '<i data-lucide="book-open" style="width:48px;height:48px;margin-bottom:1rem;"></i>' +
          '<p style="font-size:0.875rem;">还没有单词，点击下方按钮添加</p></div>';
        if (window.lucide) lucide.createIcons();
        return;
      }

      var self = this;
      var html = words.map(function (word) {
        var badgeClass = 'badge-neutral';
        var badgeText = '新学';
        if (word.status === 'mastered') {
          badgeClass = 'badge-success';
          badgeText = '已掌握';
        } else if (word.status === 'learning') {
          badgeClass = 'badge-neutral';
          badgeText = '待复习';
        } else if (word.status === 'error') {
          badgeClass = 'badge-error';
          badgeText = '错题';
        }

        return (
          '<div class="lib-card" data-word-id="' + word.id + '">' +
          '<div class="lib-card-text">' +
          '<span class="lib-word">' + self.escapeHtml(word.english) + '</span>' +
          '<span class="lib-meaning">' + self.escapeHtml(word.chinese) + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
          '<button class="aw-delete-btn" data-action="delete-library-word" style="font-size:12px;padding:4px 8px;">删除</button>' +
          '</div>' +
          '</div>'
        );
      }).join('');

      listContainer.innerHTML = html;
    } catch (err) {
      console.error('渲染词库失败:', err);
    }
  },

  /**
   * 渲染错题本页面
   * 获取错题，渲染列表
   */
  async renderErrorBook() {
    var page = document.getElementById('page-error-book');
    if (!page) return;

    try {
      var errorWords = await this.db.getErrorWords();

      // 更新数量
      var countEl = page.querySelector('.error-count');
      if (countEl) countEl.textContent = errorWords.length;

      // 渲染错题列表
      var listContainer = page.querySelector('.error-list');
      if (!listContainer) return;

      if (errorWords.length === 0) {
        listContainer.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;' +
          'justify-content:center;padding:5rem 1rem;text-align:center;">' +
          '<i data-lucide="file-check" style="width:64px;height:64px;color:var(--wb-muted-foreground);margin-bottom:1rem;"></i>' +
          '<p style="font-size:1rem;font-weight:600;color:var(--wb-foreground);">暂无错题</p>' +
          '<p style="font-size:0.875rem;color:var(--wb-muted-foreground);margin-top:0.25rem;">继续保持！</p></div>';
        if (window.lucide) lucide.createIcons();
        return;
      }

      // 获取错题记录
      var errorRecords = await this.db.getErrorRecords();

      var self = this;
      var html = errorWords.map(function (word) {
        // 统计该词的错误次数
        var errorCount = 0;
        if (errorRecords && Array.isArray(errorRecords)) {
          errorCount = errorRecords.filter(function (r) {
            return r.wordId === word.id;
          }).length;
        }
        if (errorCount === 0) errorCount = 1;

        // 计算复习时间
        var reviewBadge = '今日复习';
        var badgeClass = 'badge-warning';
        if (word.status === 'mastered') {
          reviewBadge = '已掌握 · ' +
            (word.ebbinghausStage >= 4 ? 15 : [1,2,4,7,15][word.ebbinghausStage] || 1) +
            '天后复习';
          badgeClass = 'badge-neutral';
        } else if (word.nextReview) {
          var days = Math.ceil((word.nextReview - Date.now()) / 86400000);
          if (days > 1) {
            reviewBadge = days + '天后复习';
            badgeClass = 'badge-neutral';
          }
        }

        return (
          '<div class="error-card" data-word-id="' + word.id + '">' +
          '<div class="error-card-text">' +
          '<p class="error-word">' + self.escapeHtml(word.english) + '</p>' +
          '<p class="error-meaning">' + self.escapeHtml(word.chinese) + '</p>' +
          '</div>' +
          '<div class="error-card-badge">' +
          '<span class="badge ' + badgeClass + '">' + reviewBadge + '</span>' +
          '<span class="error-count-text">错 ' + errorCount + ' 次</span>' +
          '</div></div>'
        );
      }).join('');

      listContainer.innerHTML = html;
    } catch (err) {
      console.error('渲染错题本失败:', err);
    }
  },

  /**
   * 渲染统计页面
   * 调用 stats.render()
   */
  async renderStats() {
    if (this.stats) {
      await this.stats.render();
    }
  },

  /* === 工具方法 === */

  /**
   * 显示 Toast 提示（fixed top，3秒后消失）
   * type: 'success' / 'error' / 'info'
   */
  showToast(message, type) {
    type = type || 'info';

    // 使用 index.html 中的 #toast 元素，或创建临时 toast
    var toast = document.getElementById('toast');
    if (toast) {
      // 使用现有 toast 元素
      toast.className = 'toast toast-' + type + ' toast-show';
      toast.textContent = message;
      // 3秒后隐藏
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () {
        toast.className = 'toast toast-' + type;
      }, 3000);
    } else {
      // 创建临时 toast
      var colors = {
        success: '#16a34a',
        error: '#ef4444',
        info: '#3b82f6'
      };
      var div = document.createElement('div');
      div.style.cssText =
        'position:fixed;top:1rem;left:50%;transform:translateX(-50%);' +
        'z-index:9999;background:' + (colors[type] || colors.info) + ';color:#fff;' +
        'padding:10px 20px;border-radius:8px;font-size:14px;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.15);opacity:0;' +
        'transition:opacity 0.3s ease;';
      div.textContent = message;
      document.body.appendChild(div);
      requestAnimationFrame(function () {
        div.style.opacity = '1';
      });
      setTimeout(function () {
        div.style.opacity = '0';
        setTimeout(function () {
          if (div.parentNode) div.parentNode.removeChild(div);
        }, 300);
      }, 3000);
    }
  },

  /**
   * 显示全屏 Loading 遮罩
   */
  showLoading(message) {
    // 检查是否已有 loading 遮罩
    var overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      // 创建 loading 遮罩
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.style.cssText =
        'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);' +
        'z-index:9998;align-items:center;justify-content:center;';
      overlay.innerHTML =
        '<div style="background:#fff;padding:24px 32px;border-radius:8px;' +
        'display:flex;flex-direction:column;align-items:center;gap:12px;">' +
        '<div style="width:32px;height:32px;border:3px solid #f5f5f4;' +
        'border-top-color:#0d9488;border-radius:50%;animation:wb-spin 0.8s linear infinite;"></div>' +
        '<span id="loading-text" style="font-size:14px;color:#1c1917;">加载中...</span></div>';
      document.body.appendChild(overlay);

      // 添加动画样式（如果不存在）
      if (!document.getElementById('wb-spinner-style')) {
        var style = document.createElement('style');
        style.id = 'wb-spinner-style';
        style.textContent = '@keyframes wb-spin{to{transform:rotate(360deg);}}';
        document.head.appendChild(style);
      }
    }
    overlay.style.display = 'flex';
    var text = document.getElementById('loading-text');
    if (text) text.textContent = message || '加载中...';
  },

  /**
   * 隐藏 Loading 遮罩
   */
  hideLoading() {
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  /**
   * HTML 转义，防止 XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  },

  /* === 事件绑定 === */

  /**
   * 绑定所有事件（使用事件委托）
   */
  bindEvents() {
    var self = this;

    // 使用 click 事件委托处理所有按钮点击
    document.addEventListener('click', function (e) {
      var target = e.target;

      // === 底部导航点击 ===
      var navItem = target.closest('#bottom-nav .nav-item');
      if (navItem) {
        e.preventDefault();
        var navKey = navItem.getAttribute('data-nav');
        if (navKey) self.navigate(navKey);
        return;
      }

      // === 首页快捷入口 ===
      if (target.closest('[data-action="goto-library"]')) {
        e.preventDefault();
        self.navigate('library');
        return;
      }
      if (target.closest('[data-action="goto-error-book"]')) {
        e.preventDefault();
        self.navigate('error-book');
        return;
      }
      if (target.closest('[data-action="goto-stats"]')) {
        e.preventDefault();
        self.navigate('stats');
        return;
      }

      // === 首页"开始今日学习" ===
      if (target.closest('[data-action="start-study"], .home-start-btn')) {
        e.preventDefault();
        if (self.study) self.study.start();
        return;
      }

      // === 词库"添加单词" ===
      if (target.closest('[data-action="add-words"], [data-action="goto-add-words"], .lib-add-btn, .lib-fab')) {
        e.preventDefault();
        self.navigate('add-words');
        return;
      }

      // === 添加单词页：返回 ===
      if (target.closest('[data-action="back-to-library"], .aw-back-btn')) {
        e.preventDefault();
        self.navigate('library');
        return;
      }

      // === 添加单词页：拍照 ===
      if (target.closest('[data-action="take-photo"], [data-action="camera-capture"], .aw-camera-btn')) {
        e.preventDefault();
        self.handleCameraCapture();
        return;
      }

      // === 添加单词页：导入图片 ===
      if (target.closest('[data-action="import-image"], [data-action="file-import"], .aw-import-btn')) {
        e.preventDefault();
        self.handleFileImport();
        return;
      }

      // === 添加单词页：手动添加 ===
      if (target.closest('[data-action="manual-add"], .aw-manual-add-btn')) {
        e.preventDefault();
        self.handleManualAdd();
        return;
      }

      // === 添加单词页：删除已识别单词 ===
      var deleteBtn = target.closest('[data-action="delete-word"], .aw-delete-btn');
      if (deleteBtn) {
        e.preventDefault();
        var wordCard = deleteBtn.closest('.aw-word-card');
        if (wordCard) {
          var index = parseInt(wordCard.getAttribute('data-index'), 10);
          if (!isNaN(index)) {
            self._recognizedWords.splice(index, 1);
            self.renderRecognizedWords();
          }
        }
        return;
      }

      // === 词库页：删除单词 ===
      var libDeleteBtn = target.closest('[data-action="delete-library-word"]');
      if (libDeleteBtn) {
        e.preventDefault();
        var libCard = libDeleteBtn.closest('.lib-card');
        if (libCard) {
          var wordId = parseInt(libCard.getAttribute('data-word-id'), 10);
          if (!isNaN(wordId)) {
            if (window.confirm('确定要删除这个单词吗？')) {
              self.handleDeleteWord(wordId);
            }
          }
        }
        return;
      }

      // === 添加单词页：保存到单词库 ===
      if (target.closest('[data-action="save-words"], .aw-save-btn')) {
        e.preventDefault();
        self.handleSaveWords();
        return;
      }

      // === 学习页：退出 ===
      if (target.closest('[data-action="exit-study"], .study-exit-btn')) {
        e.preventDefault();
        if (self.study) self.study.exit();
        return;
      }

      // === 学习页：麦克风按钮 ===
      if (target.closest('[data-action="mic-button"], .study-mic-btn')) {
        e.preventDefault();
        if (self.study && !self.study.isListening && self.study.readCount < 5) {
          self.study.startListening();
        }
        return;
      }

      // === 学习页：手动"已读一遍" ===
      if (target.closest('[data-action="manual-read-once"], #study-manual-btn')) {
        e.preventDefault();
        if (self.study && self.study.readCount < 5) {
          self.study.incrementReadCount();
        }
        return;
      }

      // === 学习页：下一个 ===
      if (target.closest('[data-action="next-word"], .study-next-btn')) {
        e.preventDefault();
        if (self.study) self.study.completeCurrentWord();
        return;
      }

      // === 学习完成页：开始检测 ===
      if (target.closest('[data-action="start-test"], .study-complete-test-btn')) {
        e.preventDefault();
        if (self.test) self.test.start();
        return;
      }

      // === 学习完成页：返回首页 ===
      if (target.closest('[data-action="back-home-from-study"], .study-complete-home-btn')) {
        e.preventDefault();
        self.navigate('home');
        return;
      }

      // === 检测页：退出 ===
      if (target.closest('[data-action="exit-test"], .test-exit-btn')) {
        e.preventDefault();
        if (self.test) self.test.exit();
        return;
      }

      // === 检测页：麦克风按钮 ===
      if (target.closest('[data-action="mic-record"], .test-mic-btn')) {
        e.preventDefault();
        if (self.test && !self.test.isListening && !self.test.resultRecorded) {
          self.test.startListening();
        }
        return;
      }

      // === 检测页：跳过/下一题 ===
      if (target.closest('[data-action="skip-word"], .test-skip-btn')) {
        e.preventDefault();
        var skipBtn = target.closest('[data-action="skip-word"], .test-skip-btn');
        if (skipBtn && skipBtn.textContent.indexOf('下一题') !== -1) {
          if (self.test) self.test.nextQuestion();
        } else {
          if (self.test) self.test.skipQuestion();
        }
        return;
      }

      // === 检测结果页：返回首页 ===
      if (target.closest('[data-action="back-home-from-result"], .result-home-btn')) {
        e.preventDefault();
        self.navigate('home');
        return;
      }

      // === 检测结果页：查看错题本 ===
      if (target.closest('[data-action="review-errors"], .result-error-btn')) {
        e.preventDefault();
        self.navigate('error-book');
        return;
      }

      // === 错题本：筛选 chips ===
      var filterChip = target.closest('.filter-chip');
      if (filterChip) {
        e.preventDefault();
        var allChips = filterChip.parentElement.querySelectorAll('.filter-chip');
        allChips.forEach(function (chip) {
          chip.classList.remove('active');
        });
        filterChip.classList.add('active');
        return;
      }

      // === 通用返回按钮 ===
      if (target.closest('[data-action="back"], .back-btn, .header-back-btn')) {
        e.preventDefault();
        // 优先返回首页
        self.navigate('home');
        return;
      }
    });

    // === 词库搜索输入 ===
    document.addEventListener('input', function (e) {
      var searchInput = e.target.closest('.lib-search-input');
      if (searchInput) {
        self.handleLibrarySearch(searchInput.value);
      }
    });

    // 添加单词页手动输入回车提交
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var enInput = e.target.closest('#aw-en-input, .aw-en-input');
        var cnInput = e.target.closest('#aw-cn-input, .aw-cn-input');
        if (enInput || cnInput) {
          e.preventDefault();
          self.handleManualAdd();
        }
      }
    });
  },

  /* === 添加单词页相关方法 === */

  /**
   * 处理拍照识别
   */
  async handleCameraCapture() {
    try {
      // 不在拍照前显示 loading，避免遮挡摄像头 UI
      var blob = await this.ocr.captureFromCamera();

      this.showLoading('正在识别...');
      var words = await this.ocr.recognize(blob);
      this.hideLoading();

      if (words && words.length > 0) {
        var self = this;
        this.ocr.showEditDialog(
          words,
          function (confirmedWords) {
            confirmedWords.forEach(function (w) {
              self._recognizedWords.push({
                english: w.english,
                chinese: w.chinese
              });
            });
            self.renderRecognizedWords();
            self.showToast('识别到 ' + confirmedWords.length + ' 个单词', 'success');
          },
          function () {
            // 用户取消
          }
        );
      } else {
        this.showToast('未识别到单词，请重试', 'info');
      }
    } catch (err) {
      this.hideLoading();
      console.error('拍照识别失败:', err);
      this.showToast('拍照识别失败', 'error');
    }
  },

  /**
   * 处理文件导入识别
   */
  async handleFileImport() {
    try {
      // 不在文件选择前显示 loading，避免遮挡文件选择器
      var blob = await this.ocr.importFromFile();

      this.showLoading('正在识别...');
      var words = await this.ocr.recognize(blob);
      this.hideLoading();

      if (words && words.length > 0) {
        var self = this;
        this.ocr.showEditDialog(
          words,
          function (confirmedWords) {
            confirmedWords.forEach(function (w) {
              self._recognizedWords.push({
                english: w.english,
                chinese: w.chinese
              });
            });
            self.renderRecognizedWords();
            self.showToast('识别到 ' + confirmedWords.length + ' 个单词', 'success');
          },
          function () {
            // 用户取消
          }
        );
      } else {
        this.showToast('未识别到单词，请重试', 'info');
      }
    } catch (err) {
      this.hideLoading();
      console.error('文件导入识别失败:', err);
      this.showToast('文件导入识别失败', 'error');
    }
  },

  /**
   * 处理手动添加单词
   */
  handleManualAdd() {
    var page = document.getElementById('page-add-words');
    if (!page) return;

    var enInput = page.querySelector('#aw-en-input, .aw-en-input');
    var cnInput = page.querySelector('#aw-cn-input, .aw-cn-input');

    if (!enInput || !cnInput) return;

    var english = enInput.value.trim();
    var chinese = cnInput.value.trim();

    if (!english || !chinese) {
      this.showToast('请输入英文和中文', 'error');
      return;
    }

    // 添加到已识别列表
    this._recognizedWords.push({ english: english, chinese: chinese });

    // 清空输入框
    enInput.value = '';
    cnInput.value = '';
    enInput.focus();

    // 更新显示
    this.renderRecognizedWords();
    this.showToast('已添加', 'success');
  },

  /**
   * 渲染已识别的单词列表
   */
  renderRecognizedWords() {
    var page = document.getElementById('page-add-words');
    if (!page) return;

    var listContainer = page.querySelector('.aw-word-list');
    var countBadge = page.querySelector('.aw-count-badge');

    if (countBadge) {
      countBadge.textContent = String(this._recognizedWords.length);
    }

    if (!listContainer) return;

    if (this._recognizedWords.length === 0) {
      listContainer.innerHTML =
        '<div style="text-align:center;padding:1.5rem;color:var(--wb-muted-foreground);font-size:0.875rem;">' +
        '还没有添加单词</div>';
      return;
    }

    var self = this;
    var html = this._recognizedWords.map(function (word, index) {
      return (
        '<div class="aw-word-card" data-index="' + index + '">' +
        '<div><div class="aw-word-en">' + self.escapeHtml(word.english) +
        '</div><div class="aw-word-cn">' + self.escapeHtml(word.chinese) +
        '</div></div>' +
        '<button class="aw-delete-btn" data-action="delete-word">删除</button>' +
        '</div>'
      );
    }).join('');

    listContainer.innerHTML = html;
  },

  /**
   * 保存已识别的单词到数据库
   */
  async handleSaveWords() {
    if (this._recognizedWords.length === 0) {
      this.showToast('没有需要保存的单词', 'info');
      return;
    }

    try {
      this.showLoading('正在保存...');

      var count = 0;
      for (var i = 0; i < this._recognizedWords.length; i++) {
        var word = this._recognizedWords[i];
        await this.db.addWord(word.english, word.chinese, '', 'ocr');
        count++;
      }

      this.hideLoading();

      // 清空列表
      this._recognizedWords = [];

      this.showToast('已保存 ' + count + ' 个单词', 'success');

      // 返回词库并刷新
      await this.navigate('library');
    } catch (err) {
      this.hideLoading();
      console.error('保存单词失败:', err);
      this.showToast('保存失败', 'error');
    }
  },

  /**
   * 删除词库中的单词
   */
  async handleDeleteWord(wordId) {
    try {
      this.showLoading('正在删除...');
      await this.db.deleteWord(wordId);
      this.hideLoading();
      this.showToast('已删除', 'success');
      await this.renderLibrary();
    } catch (err) {
      this.hideLoading();
      console.error('删除单词失败:', err);
      this.showToast('删除失败', 'error');
    }
  },

  /**
   * 处理词库搜索
   */
  async handleLibrarySearch(keyword) {
    var page = document.getElementById('page-library');
    if (!page) return;

    var listContainer = page.querySelector('.lib-list');
    if (!listContainer) return;

    try {
      var words;
      if (keyword && keyword.trim()) {
        words = await this.db.searchWords(keyword.trim());
      } else {
        words = await this.db.getAllWords();
      }

      if (words.length === 0) {
        listContainer.innerHTML =
          '<div style="text-align:center;padding:3rem 1rem;color:var(--wb-muted-foreground);">' +
          '未找到匹配的单词</div>';
        return;
      }

      var self = this;
      var html = words.map(function (word) {
        var badgeClass = 'badge-neutral';
        var badgeText = '新学';
        if (word.status === 'mastered') {
          badgeClass = 'badge-success';
          badgeText = '已掌握';
        } else if (word.status === 'learning') {
          badgeClass = 'badge-neutral';
          badgeText = '待复习';
        } else if (word.status === 'error') {
          badgeClass = 'badge-error';
          badgeText = '错题';
        }

        return (
          '<div class="lib-card" data-word-id="' + word.id + '">' +
          '<div class="lib-card-text">' +
          '<span class="lib-word">' + self.escapeHtml(word.english) + '</span>' +
          '<span class="lib-meaning">' + self.escapeHtml(word.chinese) + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
          '<button class="aw-delete-btn" data-action="delete-library-word" style="font-size:12px;padding:4px 8px;">删除</button>' +
          '</div>' +
          '</div>'
        );
      }).join('');

      listContainer.innerHTML = html;
    } catch (err) {
      console.error('搜索失败:', err);
    }
  }
};

// 导出为全局变量
window.app = App;

// 启动应用
window.addEventListener('DOMContentLoaded', function () {
  App.init();
});
