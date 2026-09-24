/**
 * ocr.js — 拍照/图片导入 + OCR 识别
 * 封装摄像头拍照、文件导入、Tesseract.js OCR 文字识别功能。
 * 支持英文单词和中文意思的识别及配对。
 * 导出为全局变量 window.OCRController。
 */

(function (global) {
  'use strict';

  function OCRController() {
    this._tesseractLoaded = false;
    this._cameraStream = null;
    this._overlayId = 'wb-camera-overlay';
    this._dialogId = 'wb-ocr-dialog';
  }

  /**
   * 从摄像头拍照
   */
  OCRController.prototype.captureFromCamera = function () {
    var self = this;

    return new Promise(function (resolve, reject) {
      if (document.getElementById(self._overlayId)) {
        reject(new Error('拍照界面已打开'));
        return;
      }

      var overlay = self._createCameraOverlay(resolve, reject);
      document.body.appendChild(overlay);

      var video = overlay.querySelector('video');

      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        .then(function (stream) {
          self._cameraStream = stream;
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.play().catch(function () {});
        })
        .catch(function (err) {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
          reject(new Error('无法访问摄像头: ' + (err.message || err)));
        });
    });
  };

  /**
   * 创建拍照覆盖层 UI
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

    var video = document.createElement('video');
    video.style.cssText = [
      'width: 100%',
      'height: 100%',
      'object-fit: cover',
      'flex: 1',
    ].join(';');
    video.autoplay = true;
    overlay.appendChild(video);

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

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = self._btnStyle('#78716c', '#ffffff');
    cancelBtn.onclick = function () {
      self._closeCamera(overlay);
      reject(new Error('用户取消拍照'));
    };
    controls.appendChild(cancelBtn);

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

    var placeholder = document.createElement('div');
    placeholder.style.cssText = 'width: 80px; flex-shrink: 0;';
    controls.appendChild(placeholder);

    return overlay;
  };

  /**
   * 关闭摄像头和覆盖层
   */
  OCRController.prototype._closeCamera = function (overlay) {
    if (this._cameraStream) {
      this._cameraStream.getTracks().forEach(function (track) {
        track.stop();
      });
      this._cameraStream = null;
    }
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  /**
   * 从文件导入
   */
  OCRController.prototype.importFromFile = function () {
    var self = this;

    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.cssText = 'position:absolute;top:-100px;left:-100px;width:1px;height:1px;opacity:0;';

      input.onchange = function (e) {
        var file = e.target.files[0];
        if (file) {
          resolve(file);
        } else {
          reject(new Error('用户未选择文件'));
        }
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
      };

      input.oncancel = function () {
        reject(new Error('用户取消选择文件'));
      };

      document.body.appendChild(input);
      input.click();
    });
  };

  /**
   * 动态加载脚本
   */
  OCRController.prototype.loadScript = function (url) {
    var self = this;

    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        if (global.Tesseract) {
          self._tesseractLoaded = true;
          resolve();
          return;
        }
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
   * 尝试从多个 CDN 加载 Tesseract.js
   */
  OCRController.prototype._loadTesseract = function () {
    var self = this;
    var cdnUrls = [
      'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
      'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js',
      'https://cdn.bootcdn.net/ajax/libs/tesseract.js/5.0.4/tesseract.min.js',
    ];

    function tryLoad(index) {
      if (index >= cdnUrls.length) {
        return Promise.reject(new Error('所有 CDN 加载失败，请检查网络连接'));
      }
      return self.loadScript(cdnUrls[index]).catch(function () {
        return tryLoad(index + 1);
      });
    }

    return tryLoad(0);
  };

  /**
   * OCR 识别图片中的单词
   * 使用 Tesseract.js 识别英文和中文，按行配对
   */
  OCRController.prototype.recognize = function (imageBlob) {
    var self = this;

    var imageUrl = URL.createObjectURL(imageBlob);

    return this._loadTesseract()
      .then(function () {
        if (!global.Tesseract) {
          throw new Error('Tesseract.js 加载失败');
        }
        // 用英文 + 中文同时识别
        return self._recognizeWithLang(imageUrl, 'eng+chi_sim');
      })
      .then(function (fullText) {
        URL.revokeObjectURL(imageUrl);
        var words = self._parseMixedText(fullText);
        return words;
      })
      .catch(function (err) {
        URL.revokeObjectURL(imageUrl);
        console.error('[OCRController] OCR 识别失败:', err);
        throw err;
      });
  };

  /**
   * 使用 Tesseract.js v5 createWorker API 识别
   */
  OCRController.prototype._recognizeWithLang = function (imageUrl, lang) {
    return global.Tesseract.createWorker(lang, 1, {
      logger: function () {},
    }).then(function (worker) {
      return worker.recognize(imageUrl).then(function (result) {
        var text = (result && result.data && result.data.text) || '';
        return worker.terminate().then(function () {
          return text;
        });
      }).catch(function (err) {
        return worker.terminate().then(function () {
          throw err;
        });
      });
    });
  };

  /**
   * 解析混合中英文文本，提取单词对
   * 常见格式：每行一个单词，如 "apple 苹果" 或 "apple\n苹果"
   */
  OCRController.prototype._parseMixedText = function (text) {
    var lines = (text || '')
      .split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });

    var results = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // 尝试用空格或制表符分割
      var parts = line.split(/[\s\t]+/).filter(function (p) { return p.length > 0; });

      // 判断英文部分和中文部分
      var english = '';
      var chinese = '';

      if (parts.length >= 2) {
        // 找到英文部分（纯字母）和中文部分
        for (var j = 0; j < parts.length; j++) {
          var p = parts[j];
          if (/^[a-zA-Z]/.test(p) && !english) {
            english = p;
          } else if (/[\u4e00-\u9fa5]/.test(p) && !chinese) {
            chinese = p;
          }
        }
        // 如果还有更多中文部分，拼接
        for (var k = 0; k < parts.length; k++) {
          var p2 = parts[k];
          if (/[\u4e00-\u9fa5]/.test(p2) && chinese && p2 !== chinese) {
            chinese = chinese + p2;
          }
        }
      } else if (parts.length === 1) {
        // 只有一个部分
        if (/^[a-zA-Z]/.test(parts[0])) {
          english = parts[0];
        } else if (/[\u4e00-\u9fa5]/.test(parts[0])) {
          chinese = parts[0];
        }
      }

      // 如果当前行只有英文或只有中文，尝试和相邻行配对
      if (english && !chinese) {
        // 看看下一行是否有中文
        if (i + 1 < lines.length) {
          var nextLine = lines[i + 1].trim();
          if (/[\u4e00-\u9fa5]/.test(nextLine) && !/^[a-zA-Z]/.test(nextLine)) {
            chinese = nextLine;
            i++; // 跳过下一行
          }
        }
      }

      if (english || chinese) {
        results.push({
          english: english,
          chinese: chinese,
        });
      }
    }

    // 如果一条都没识别到，返回空数组（让上层提示用户手动输入）
    if (results.length === 0 && lines.length > 0) {
      // 最后的 fallback：把整段文本作为一个条目
      results.push({
        english: '',
        chinese: text.substring(0, 50).trim(),
      });
    }

    return results;
  };

  /**
   * 显示识别结果供用户编辑确认
   */
  OCRController.prototype.showEditDialog = function (words, onConfirm, onCancel) {
    var self = this;

    if (document.getElementById(this._dialogId)) {
      return;
    }

    var editableWords = (words || []).map(function (w) {
      return {
        english: w.english || '',
        chinese: w.chinese || '',
      };
    });

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

    var hint = document.createElement('p');
    hint.textContent = '请核对并修改识别结果，确认无误后点击保存';
    hint.style.cssText = [
      'margin: 0 0 16px 0',
      'font-size: 13px',
      'color: #78716c',
      'text-align: center',
    ].join(';');
    content.appendChild(hint);

    var rowsContainer = document.createElement('div');
    rowsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;';
    content.appendChild(rowsContainer);

    function createRow(word) {
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

      var engInput = document.createElement('input');
      engInput.type = 'text';
      engInput.value = word.english;
      engInput.placeholder = '英文';
      engInput.style.cssText = self._inputStyle();
      row.appendChild(engInput);

      var chiInput = document.createElement('input');
      chiInput.type = 'text';
      chiInput.value = word.chinese;
      chiInput.placeholder = '中文';
      chiInput.style.cssText = self._inputStyle();
      row.appendChild(chiInput);

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

    editableWords.forEach(function (word) {
      rowsContainer.appendChild(createRow(word));
    });

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

    var btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 12px;';
    content.appendChild(btnContainer);

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = this._btnStyle('#e7e5e4', '#44403c');
    cancelBtn.onclick = function () {
      self._closeDialog(dialog);
      if (onCancel) onCancel();
    };
    btnContainer.appendChild(cancelBtn);

    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = '保存';
    confirmBtn.style.cssText = this._btnStyle('#0d9488', '#ffffff');
    confirmBtn.onclick = function () {
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

  OCRController.prototype._closeDialog = function (dialog) {
    if (dialog && dialog.parentNode) {
      dialog.parentNode.removeChild(dialog);
    }
  };

  // ==================== 内部样式工具 ====================

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

  global.OCRController = OCRController;
})(window);
