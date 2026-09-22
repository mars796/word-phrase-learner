/**
 * stats.js — 统计图表控制器
 *
 * 渲染统计页面：连续学习天数、艾宾浩斯遗忘曲线图（ECharts）、
 * 掌握进度条、最近7天学习记录。
 * ECharts 从 CDN 加载，如果未加载则跳过图表渲染。
 * 导出为全局变量 window.StatsController。
 */

class StatsController {
  constructor() {
    /** ECharts 实例 */
    this.chartInstance = null;
  }

  /**
   * 渲染统计页面
   * 获取数据并渲染各部分内容
   */
  async render() {
    try {
      // 获取连续学习天数
      const streak = await window.db.getStreak();
      // 获取掌握统计
      const masteryStats = await window.db.getMasteryStats();
      // 获取最近7天学习记录
      const weeklyStats = await window.db.getStudyStats(7);

      // 渲染连续天数和已学单词数
      this.renderKeyMetrics(streak, masteryStats);

      // 渲染遗忘曲线图（ECharts）
      this.renderForgettingCurve();

      // 渲染掌握进度条
      this.renderMasteryProgress(masteryStats);

      // 渲染最近7天学习记录
      this.renderWeeklyStats(weeklyStats);

      // 重新渲染 Lucide 图标
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('渲染统计页面失败:', err);
    }
  }

  /**
   * 渲染关键指标：已学单词数、连续学习天数
   */
  renderKeyMetrics(streak, masteryStats) {
    const page = document.getElementById('page-stats');
    if (!page) return;

    // 获取两个关键指标卡片
    const statCards = page.querySelectorAll('.grid.grid-cols-2 .stat-card');
    if (statCards.length >= 2) {
      // 已学单词数
      const learnedValue = statCards[0].querySelector('.text-3xl');
      if (learnedValue) learnedValue.textContent = String(masteryStats?.total || 0);

      // 连续学习天数
      const streakValue = statCards[1].querySelector('.text-3xl');
      if (streakValue) streakValue.textContent = String(streak || 0);
    }
  }

  /**
   * 渲染遗忘曲线图（使用 ECharts）
   * X轴：天数 0-15，Y轴：记忆保留率 0-100
   * 曲线 + 标注5个复习节点（1/2/4/7/15天）
   * 品牌色风格
   */
  renderForgettingCurve() {
    // 获取图表容器（canvas 的父 div）
    const canvas = document.getElementById('ebbinghaus-chart');
    if (!canvas) return;

    // 使用父容器作为 ECharts 容器
    const container = canvas.parentElement;
    if (!container) return;

    // 检查 ECharts 是否已加载
    if (typeof echarts === 'undefined') {
      // 尝试动态加载 ECharts
      this.loadECharts()
        .then(() => this.renderForgettingCurve())
        .catch(() => {
          console.warn('ECharts 未加载，跳过图表渲染');
          // 显示文字提示替代图表
          container.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--wb-muted-foreground);font-size:0.875rem;">图表加载中...</div>';
        });
      return;
    }

    // 获取遗忘曲线数据
    const curveData = window.engine.getForgettingCurve(15);

    // 销毁旧实例
    if (this.chartInstance) {
      this.chartInstance.dispose();
      this.chartInstance = null;
    }

    // 清空容器内容，用 div 替代 canvas
    container.innerHTML = '';
    const chartDiv = document.createElement('div');
    chartDiv.style.width = '100%';
    chartDiv.style.height = '200px';
    container.appendChild(chartDiv);

    // 初始化 ECharts 实例
    this.chartInstance = echarts.init(chartDiv);

    // 复习阶段节点：[1, 2, 4, 7, 15]
    const stages = window.engine.stages;

    // 标注复习节点的 markPoint 数据
    const markPoints = stages.map((day) => {
      const point = curveData.find((d) => d.day === day);
      return {
        coord: [day, point ? point.retention : 0],
        value: `${day}天`,
        itemStyle: { color: '#0d9488' },
        label: { color: '#fff', fontSize: 10, fontWeight: 'bold' }
      };
    });

    // 品牌色风格配置
    this.chartInstance.setOption({
      grid: {
        left: 40,
        right: 15,
        top: 25,
        bottom: 35,
        containLabel: false
      },
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          const data = params[0];
          return `第${data.data[0]}天<br/>记忆保留：${data.data[1]}%`;
        },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e7e5e4',
        borderWidth: 1,
        textStyle: { color: '#1c1917', fontSize: 12 }
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 15,
        name: '天',
        nameLocation: 'end',
        nameTextStyle: { color: '#78716c', fontSize: 11 },
        axisLabel: {
          color: '#78716c',
          fontSize: 11,
          formatter: '{value}'
        },
        axisLine: { lineStyle: { color: '#e7e5e4' } },
        axisTick: { lineStyle: { color: '#e7e5e4' } },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: {
          color: '#78716c',
          fontSize: 11,
          formatter: '{value}%'
        },
        axisLine: { lineStyle: { color: '#e7e5e4' } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f5f5f4' } }
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: curveData.map((d) => [d.day, d.retention]),
          lineStyle: {
            color: '#0d9488',
            width: 2.5
          },
          itemStyle: {
            color: '#0d9488',
            borderColor: '#fff',
            borderWidth: 2
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(13, 148, 136, 0.15)' },
                { offset: 1, color: 'rgba(13, 148, 136, 0.01)' }
              ]
            }
          },
          markPoint: {
            symbol: 'circle',
            symbolSize: 28,
            data: markPoints
          }
        }
      ]
    });

    // 窗口大小变化时重绘
    if (!this._resizeBound) {
      this._resizeBound = true;
      window.addEventListener('resize', () => {
        if (this.chartInstance) {
          this.chartInstance.resize();
        }
      });
    }
  }

  /**
   * 动态加载 ECharts CDN 脚本
   */
  loadECharts() {
    return new Promise((resolve, reject) => {
      if (typeof echarts !== 'undefined') {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Failed to load ECharts from CDN'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * 渲染掌握进度条
   * 三条进度条：已掌握/学习中/未掌握，每条显示数量和百分比
   */
  renderMasteryProgress(stats) {
    const page = document.getElementById('page-stats');
    if (!page) return;

    const total = stats?.total || 0;
    const mastered = stats?.mastered || 0;
    const learning = stats?.learning || 0;
    const error = stats?.error || 0;

    // 计算百分比
    const masteredPercent = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const learningPercent = total > 0 ? Math.round((learning / total) * 100) : 0;
    const errorPercent = total > 0 ? Math.round((error / total) * 100) : 0;

    // 获取掌握情况区域的所有进度条容器
    // 结构：.section-card > div (已掌握) > .progress-track > .progress-fill
    const masterySection = page.querySelector('.section-card.space-y-4');
    if (!masterySection) return;

    const progressSections = masterySection.querySelectorAll(':scope > div');
    if (progressSections.length < 3) return;

    // 已掌握
    const masteredSection = progressSections[0];
    const masteredLabel = masteredSection.querySelector('.flex span:last-child');
    const masteredFill = masteredSection.querySelector('.progress-fill');
    if (masteredLabel) masteredLabel.textContent = `${mastered}/${total} (${masteredPercent}%)`;
    if (masteredFill) masteredFill.style.width = masteredPercent + '%';

    // 学习中（待复习）
    const learningSection = progressSections[1];
    const learningLabel = learningSection.querySelector('.flex span:last-child');
    const learningFill = learningSection.querySelector('.progress-fill');
    if (learningLabel) learningLabel.textContent = `${learning}/${total} (${learningPercent}%)`;
    if (learningFill) learningFill.style.width = learningPercent + '%';

    // 未掌握
    const errorSection = progressSections[2];
    const errorLabel = errorSection.querySelector('.flex span:last-child');
    const errorFill = errorSection.querySelector('.progress-fill');
    if (errorLabel) errorLabel.textContent = `${error}/${total} (${errorPercent}%)`;
    if (errorFill) errorFill.style.width = errorPercent + '%';
  }

  /**
   * 渲染最近7天学习记录
   * 每天显示：学习数、复习数，使用柱状图
   */
  renderWeeklyStats(stats) {
    const page = document.getElementById('page-stats');
    if (!page) return;

    // 生成最近7天的日期映射（周一到周日）
    const today = new Date();
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const weeklyData = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const dayName = dayNames[date.getDay()];

      // 查找当天的学习记录
      const dayStat = stats.find((s) => {
        const statDate = new Date(s.date);
        return statDate.toISOString().split('T')[0] === dateStr;
      });

      const newWords = dayStat ? dayStat.newWords || 0 : 0;
      const reviewWords = dayStat ? dayStat.reviewWords || 0 : 0;
      const total = newWords + reviewWords;

      weeklyData.push({ dayName, newWords, reviewWords, total, dateStr });
    }

    // 更新柱状图
    const weeklyBars = page.querySelectorAll('.weekly-bar');
    const maxTotal = Math.max(
      ...weeklyData.map((d) => d.total),
      1
    );

    weeklyBars.forEach((bar, i) => {
      if (i < weeklyData.length) {
        const data = weeklyData[i];
        const height = (data.total / maxTotal) * 100;
        bar.style.height = Math.max(height, 2) + '%';

        if (data.total === 0) {
          bar.style.backgroundColor = 'var(--wb-border)';
        } else {
          bar.style.backgroundColor = 'var(--wb-primary)';
        }
      }
    });

    // 更新底部日期标签
    const dayLabels = page.querySelectorAll('.flex.flex-row.gap-2 span');
    if (dayLabels.length >= 7) {
      weeklyData.forEach((data, i) => {
        if (dayLabels[i]) {
          dayLabels[i].textContent = data.dayName;
        }
      });
    }

    // 更新本周总数和日均
    const weekTotal = weeklyData.reduce((sum, d) => sum + d.total, 0);
    const dailyAvg = (weekTotal / 7).toFixed(1);

    // 找到底部统计文本
    const summarySection = page.querySelector('.flex.items-center.justify-center.gap-4');
    if (summarySection) {
      const summarySpans = summarySection.querySelectorAll('span');
      if (summarySpans.length >= 2) {
        // 本周共学
        const weekTotalSpan = summarySpans[0].querySelector('span');
        if (weekTotalSpan) weekTotalSpan.textContent = String(weekTotal);

        // 日均
        const dailyAvgSpan = summarySpans[1].querySelector('span');
        if (dailyAvgSpan) dailyAvgSpan.textContent = String(dailyAvg);
      }
    }
  }

  /**
   * 销毁 ECharts 实例（页面离开时调用）
   */
  destroy() {
    if (this.chartInstance) {
      this.chartInstance.dispose();
      this.chartInstance = null;
    }
  }
}

// 导出为全局变量
window.StatsController = StatsController;
