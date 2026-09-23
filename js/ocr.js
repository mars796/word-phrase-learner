/**
 * ocr.js — 拍照/图片导入 + OCR 识别
 * 封装摄像头拍照、文件导入、Tesseract.js OCR 文字识别功能。
 * 支持英文单词和中文意思的识别及配对。
 * 导出为全局变量 window.OCRController。
 */

(function (global) {
  'use strict';

  /**
   * OCRController — OCR 识别控制器
   * 提供拍照、文件导入、OCR 识别和编辑确认功能
   */
  function OCRController() {
    this._tesseractLoaded = false;
    this._worker = null;
    this._cameraStream = null;
    this._overlayId = 'wb-camera-overlay';
    this._dialogId = 'wb-ocr-dialog';
  }

  /**
   * 从摄像头拍照
   * 创建全屏拍照界面，用户点击拍照按钮后截取画面
   * @returns {Promise<Blob>} 图片数据
   */
  OCRController.prototype.captureFromCamera = function () {
    var self = this;

    return new Promise(function (resolve, reject) {
      // 检查是否已有打开的拍照界面
      if (document.getElementById(self._overlayId)) {
        reject(new Error('拍照界面已打开'));
        return;
      }

      // 创建全屏覆盖层
      var overlay = self._createCameraOverlay(resolve, reject);
      document.body.appendChild(overlay);

      var video = overlay.querySelector('video');

      // 请求摄像头权限
      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: 'environment', // 优先后置摄像头
          },
          audio: false,
        })
        .then(function (stream) {
          self._cameraStream = stream;
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.play().catch(function () {});
        })
        .catch(function (err) {
          // 移除覆盖层
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
          reject(new Error('无法访问摄像头: ' + (err.message || err)));
        });
    });
  };

  /**
   * 创建拍照覆盖层 UI
   * @param {Function} resolve - Promise resolve
   * @param {Function} reject - Promise reject
   * @returns {HTMLElement} 覆盖层 DOM 元素
   */
  OCRController.prototype._createCameraOverlay = function (resolve, reject) {
    var self = this;

    var overlay = document.createElement('div');
    overlay.id = this._overlayId;
    overlay.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 100%',
      'height: 100%',
      'z-index: 10000',
      'background-color: #000',
      'display: flex',
      'flex-direction: column',
      'align-items: center',
      'justify-content: center',
    ].join(';');

    // 视频预览
    var video = document.createElement('video');
    video.style.cssText = [
      'width: 100%',
      'height: 100%',
      'object-fit: cover',
      'flex: 1',
    ].join(';');
    video.autoplay = true;
    overlay.appendChild(video);

    // 底部控制栏
    var controls = document.createElement('div');
    controls.style.cssText = [
      'position: absolute',
      'bottom: 0',
      'left: 0',
      'right: 0',
      'display: flex',
      'align-items: center',
      'justify-content: space-around',
      'padding: 24px 20px',
      'padding-bottom: calc(24px + env(safe-area-inset-bottom))',
      'background: linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
    ].join(';');
    overlay.appendChild(controls);

    // 取消按钮
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = self._btnStyle('#78716c', '#ffffff');
    cancelBtn.onclick = function () {
      self._closeCamera(overlay);
      reject(new Error('用户取消拍照'));
    };
    controls.appendChild(cancelBtn);

    // 拍照按钮（中间大圆按钮）
    var captureBtn = document.createElement('button');
    captureBtn.textContent = '拍照';
    captureBtn.style.cssText = [
      'width: 72px',
      'height: 72px',
      'border-radius: 50%',
      'border: 4px solid #ffffff',
      'background-color: #0d9488',
      'color: #ffffff',
      'font-size: 13px',
      'cursor: pointer',
      'flex-shrink: 0',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'font-family: "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    ].join(';');
    captureBtn.onclick = function () {
      // 从视频截取画面
      var canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1080;
      canvas.height = video.videoHeight || 1920;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(function (blob) {
        self._closeCamera(overlay);
        resolve(blob);
      }, 'image/jpeg', 0.9);
    };
    controls.appendChild(captureBtn);

    // 占位（保持两侧对称）
    var placeholder = document.createElement('div');
    placeholder.style.cssText = 'width: 80px; flex-shrink: 0;';
    controls.appendChild(placeholder);

    return overlay;
  };

  /**
   * 关闭摄像头和覆盖层
   */
  OCRController.prototype._closeCamera = function (overlay) {
    // 停止摄像头流
    if (this._cameraStream) {
      this._cameraStream.getTracks().forEach(function (track) {
        track.stop();
      });
      this._cameraStream = null;
    }

    // 移除覆盖层
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  /**
   * 从文件导入
   * 创建隐藏的 file input，用户选择文件后返回 Blob
   * @returns {Promise<Blob>} 图片数据
   */
  OCRController.prototype.importFromFile = function () {
    var self = this;

    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      // 移动端 Safari 需要元素在 DOM 中且可见才能触发文件选择器
      input.style.cssText = 'position:absolute;top:-100px;left:-100px;width:1px;height:1px;opacity:0;';

      input.onchange = function (e) {
        var file = e.target.files[0];
        if (file) {
          resolve(file);
        } else {
          reject(new Error('用户未选择文件'));
        }
        // 清理 input 元素
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
      };

      // 取消选择的情况
      input.oncancel = function () {
        reject(new Error('用户取消选择文件'));
      };

      document.body.appendChild(input);
      input.click();
    });
  };

  /**
   * OCR 识别图片中的单词
   * 使用 Tesseract.js 先用英文识别提取英文单词，再用中文识别提取中文意思
   * 然后按行配对返回结果
   * @param {Blob} imageBlob - 图片数据
   * @returns {Promise<Array<{english: string, chinese: string}>>}
   */
  OCRController.prototype.recognize = function (imageBlob) {
    var self = this;

    // 加载 Tesseract.js 脚本
    return this.loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js')
      .then(function () {
        var imageUrl = URL.createObjectURL(imageBlob);

        // 先用英文识别
        return self._recognizeWithLang(imageUrl, 'eng').then(function (engResult) {
          // 再用中文识别
          return self._recognizeWithLang(imageUrl, 'chi_sim').then(function (chiResult) {
            URL.revokeObjectURL(imageUrl);
            // 配对英文和中文
            return self._pairResults(engResult, chiResult);
          });
        });
      })
      .catch(function (err) {
        console.error('[OCRController] OCR 识别失败:', err);
        throw err;
      });
  };

  /**
   * 使用指定语言进行 OCR 识别
   * @param {string} imageUrl - 图片 URL
   * @param {string} lang - 语言代码 'eng' 或 'chi_sim'
   * @returns {Promise<string>} 识别的文本
   */
  OCRController.prototype._recognizeWithLang = function (imageUrl, lang) {
    return new Promise(function (resolve, reject) {
      // 创建 Tesseract worker
      var worker = new Tesseract.Worker();

      worker
        .loadLanguage(lang)
        .then(function () {
          return worker.initialize(lang);
        })
        .then(function () {
          return worker.recognize(imageUrl);
        })
        .then(function (result) {
          var text = (result && result.data && result.data.text) || '';
          worker.terminate();
          resolve(text);
        })
        .catch(function (err) {
          worker.terminate();
          reject(err);
        });
    });
  };

  /**
   * 配对英文和中文识别结果
   * 按行配对，英文行和中文行交替出现
   * @param {string} engText - 英文识别结果
   * @param {string} chiText - 中文识别结果
   * @returns {Array<{english: string, chinese: string}>}
   */
  OCRController.prototype._pairResults = function (engText, chiText) {
    var engLines = (engText || '')
      .split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });

    var chiLines = (chiText || '')
      .split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });

    var results = [];
    var maxLen = Math.max(engLines.length, chiLines.length);

    for (var i = 0; i < maxLen; i++) {
      var english = engLines[i] || '';
      var chinese = chiLines[i] || '';

      // 至少有一个非空才添加
      if (english || chinese) {
        results.push({
          english: english,
          chinese: chinese,
        });
      }
    }

    return results;
  };

  /**
   * 动态加载脚本
   * @param {string} url - 脚本 URL
   * @returns {Promise<void>}
   */
  OCRController.prototype.loadScript = function (url) {
    var self = this;

    return new Promise(function (resolve, reject) {
      // 检查是否已加载
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        // 如果已加载且 Tesseract 已定义
        if (global.Tesseract) {
          self._tesseractLoaded = true;
          resolve();
          return;
        }
        // 等待已存在的 script 加载完成
        existing.onload = function () {
          self._tesseractLoaded = true;
          resolve();
        };
        existing.onerror = function () {
          reject(new Error('加载脚本失败: ' + url));
        };
        return;
      }

      var script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = url;
      script.async = true;

      script.onload = function () {
        self._tesseractLoaded = true;
        resolve();
      };

      script.onerror = function () {
        reject(new Error('加载脚本失败: ' + url));
      };

      document.head.appendChild(script);
    });
  };

  /**
   * 显示识别结果供用户编辑确认
   * 弹出全屏编辑对话框，每行显示 english + chinese，可编辑
   * @param {Array<{english: string, chinese: string}>} words - 识别结果数组
   * @param {Function} onConfirm - 确认回调 (words) => void
   * @param {Function} onCancel - 取消回调 () => void
   */
  OCRController.prototype.showEditDialog = function (words, onConfirm, onCancel) {
    var self = this;

    // 如果已有对话框则不重复创建
    if (document.getElementById(this._dialogId)) {
      return;
    }

    var editableWords = (words || []).map(function (w) {
      return {
        english: w.english || '',
        chinese: w.chinese || '',
      };
    });

    // 创建对话框
    var dialog = document.createElement('div');
    dialog.id = this._dialogId;
    dialog.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 100%',
      'height: 100%',
      'z-index: 10001',
      'background-color: rgba(0, 0, 0, 0.5)',
      'display: flex',
      'flex-direction: column',
      'align-items: center',
      'justify-content: flex-start',
      'padding: 16px',
      'padding-top: calc(16px + env(safe-area-inset-top))',
      'box-sizing: border-box',
      'overflow-y: auto',
    ].join(';');

    // 对话框内容容器
    var content = document.createElement('div');
    content.style.cssText = [
      'width: 100%',
      'max-width: 28rem',
      'background-color: #ffffff',
      'border-radius: 16px',
      'padding: 20px 16px',
      'box-sizing: border-box',
      'font-family: "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    ].join(';');
    dialog.appendChild(content);

    // 标题
    var title = document.createElement('h3');
    title.textContent = '编辑识别结果';
    title.style.cssText = [
      'margin: 0 0 16px 0',
      'font-size: 18px',
      'font-weight: 700',
      'color: #1c1917',
      'text-align: center',
    ].join(';');
    content.appendChild(title);

    // 提示文字
    var hint = document.createElement('p');
    hint.textContent = '请核对并修改识别结果，确认无误后点击保存';
    hint.style.cssText = [
      'margin: 0 0 16px 0',
      'font-size: 13px',
      'color: #78716c',
      'text-align: center',
    ].join(';');
    content.appendChild(hint);

    // 行列表容器
    var rowsContainer = document.createElement('div');
    rowsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;';
    content.appendChild(rowsContainer);

    /**
     * 创建一行编辑组件
     */
    function createRow(word, index) {
      var row = document.createElement('div');
      row.style.cssText = [
        'display: flex',
        'align-items: center',
        'gap: 8px',
        'padding: 8px',
        'background-color: #f5f5f4',
        'border-radius: 8px',
        'border: 1px solid #e7e5e4',
      ].join(';');

      // 英文输入框
      var engInput = document.createElement('input');
      engInput.type = 'text';
      engInput.value = word.english;
      engInput.placeholder = '英文';
      engInput.style.cssText = self._inputStyle();
      row.appendChild(engInput);

      // 中文输入框
      var chiInput = document.createElement('input');
      chiInput.type = 'text';
      chiInput.value = word.chinese;
      chiInput.placeholder = '中文';
      chiInput.style.cssText = self._inputStyle();
      row.appendChild(chiInput);

      // 删除按钮
      var delBtn = document.createElement('button');
      delBtn.textContent = '\u00D7';
      delBtn.style.cssText = [
        'width: 32px',
        'height: 32px',
        'border: none',
        'border-radius: 8px',
        'background-color: #fee2e2',
        'color: #dc2626',
        'font-size: 18px',
        'cursor: pointer',
        'flex-shrink: 0',
        'display: flex',
        'align-items: center',
        'justify-content: center',
      ].join(';');
      delBtn.onclick = function () {
        rowsContainer.removeChild(row);
      };
      row.appendChild(delBtn);

      return row;
    }

    // 添加初始行
    editableWords.forEach(function (word) {
      rowsContainer.appendChild(createRow(word));
    });

    // 添加行按钮
    var addRowBtn = document.createElement('button');
    addRowBtn.textContent = '+ 添加新行';
    addRowBtn.style.cssText = [
      'width: 100%',
      'padding: 10px',
      'border: 1px dashed #d6d3d1',
      'border-radius: 8px',
      'background-color: transparent',
      'color: #0d9488',
      'font-size: 14px',
      'cursor: pointer',
      'margin-bottom: 16px',
      'font-family: inherit',
    ].join(';');
    addRowBtn.onclick = function () {
      rowsContainer.appendChild(createRow({ english: '', chinese: '' }));
    };
    content.appendChild(addRowBtn);

    // 按钮容器
    var btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 12px;';
    content.appendChild(btnContainer);

    // 取消按钮
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = this._btnStyle('#e7e5e4', '#44403c');
    cancelBtn.onclick = function () {
      self._closeDialog(dialog);
      if (onCancel) onCancel();
    };
    btnContainer.appendChild(cancelBtn);

    // 确认按钮
    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = '保存';
    confirmBtn.style.cssText = this._btnStyle('#0d9488', '#ffffff');
    confirmBtn.onclick = function () {
      // 收集所有行数据
      var result = [];
      var rows = rowsContainer.children;
      for (var i = 0; i < rows.length; i++) {
        var inputs = rows[i].querySelectorAll('input');
        var english = inputs[0] ? inputs[0].value.trim() : '';
        var chinese = inputs[1] ? inputs[1].value.trim() : '';
        if (english || chinese) {
          result.push({ english: english, chinese: chinese });
        }
      }
      self._closeDialog(dialog);
      if (onConfirm) onConfirm(result);
    };
    btnContainer.appendChild(confirmBtn);

    document.body.appendChild(dialog);
  };

  /**
   * 关闭对话框
   */
  OCRController.prototype._closeDialog = function (dialog) {
    if (dialog && dialog.parentNode) {
      dialog.parentNode.removeChild(dialog);
    }
  };

  // ==================== 内部样式工具 ====================

  /**
   * 按钮样式
   * @param {string} bgColor - 背景色
   * @param {string} textColor - 文字色
   * @returns {string} CSS 样式字符串
   */
  OCRController.prototype._btnStyle = function (bgColor, textColor) {
    return [
      'flex: 1',
      'padding: 12px 20px',
      'border: none',
      'border-radius: 8px',
      'background-color: ' + bgColor,
      'color: ' + textColor,
      'font-size: 15px',
      'font-weight: 600',
      'cursor: pointer',
      'font-family: "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    ].join(';');
  };

  /**
   * 输入框样式
   * @returns {string} CSS 样式字符串
   */
  OCRController.prototype._inputStyle = function () {
    return [
      'flex: 1',
      'min-width: 0',
      'padding: 8px 12px',
      'border: 1px solid #d6d3d1',
      'border-radius: 6px',
      'font-size: 14px',
      'outline: none',
      'font-family: inherit',
      'box-sizing: border-box',
    ].join(';');
  };

  // 导出为全局变量
  global.OCRController = OCRController;
})(window);
