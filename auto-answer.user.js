// ==UserScript==
// @name         奥派直播电商运营实训 - 自动答题助手
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  自动查看答案、选择正确选项、提交并进入下一题，支持单选和多选题
// @author       传康kk (微信:1837620622)
// @match        http://121.40.29.50/AllPassLECTM/testcenter/views/tprogress.html*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置参数 ====================
    const CONFIG = {
        // 答题延迟时间（毫秒）
        answerDelay: 800,
        // 点击下一题延迟（毫秒）
        nextDelay: 500,
        // 自动交卷确认
        autoSubmit: false,
        // 调试模式
        debug: false
    };

    // ==================== 状态管理 ====================
    let isRunning = false;
    let isPaused = false;
    let currentQuestion = 0;
    let totalQuestions = 0;
    let correctCount = 0;
    let processedCount = 0;
    
    // ==================== 答案采集存储 ====================
    let collectedAnswers = [];  // 存储采集的答案
    let isCollectMode = false;  // 是否为纯采集模式（不选择答案）
    let isQuestionBankMode = false;  // 是否为题库答题模式
    
    // ==================== 内置题库（通过选项匹配答案）====================
    // 题库格式：key为选项排序后的字符串，value为答案
    const QUESTION_BANK = new Map();

    // ==================== 日志函数 ====================
    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = {
            'info': '📘',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌'
        }[type] || '📘';
        
        console.log(`[${timestamp}] ${prefix} ${message}`);
        updateLog(`${prefix} ${message}`);
    }

    // ==================== UI 面板样式 - 科技感设计 ====================
    GM_addStyle(`
        /* 科技感主面板 - 赛博朋克风格 */
        #auto-answer-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 300px;
            background: rgba(10, 14, 39, 0.95);
            border: 1px solid rgba(0, 255, 255, 0.3);
            border-radius: 12px;
            box-shadow: 
                0 0 20px rgba(0, 255, 255, 0.2),
                0 0 40px rgba(0, 128, 255, 0.1),
                inset 0 0 60px rgba(0, 255, 255, 0.05);
            z-index: 999999;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            overflow: hidden;
            backdrop-filter: blur(10px);
        }

        #auto-answer-panel::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, #00ffff, #0080ff, #00ffff, transparent);
            animation: scanline 2s linear infinite;
        }

        @keyframes scanline {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }

        #auto-answer-panel.minimized {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid #00ffff;
            box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
        }

        #auto-answer-panel.minimized .panel-content { display: none; }
        #auto-answer-panel.minimized .panel-header {
            padding: 0;
            justify-content: center;
            height: 50px;
            background: transparent;
        }
        #auto-answer-panel.minimized .panel-title { display: none; }
        #auto-answer-panel.minimized .minimize-btn { font-size: 20px; }

        /* 科技感头部 */
        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: linear-gradient(180deg, rgba(0, 255, 255, 0.1) 0%, transparent 100%);
            border-bottom: 1px solid rgba(0, 255, 255, 0.2);
        }

        .panel-title {
            color: #00ffff;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 2px;
            text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
        }

        .minimize-btn {
            background: transparent;
            border: 1px solid rgba(0, 255, 255, 0.5);
            color: #00ffff;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .minimize-btn:hover {
            background: rgba(0, 255, 255, 0.2);
            box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
        }

        /* 面板内容 */
        .panel-content {
            padding: 16px;
        }

        /* 状态指示器 */
        .status-indicator {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
            padding: 10px 12px;
            background: rgba(0, 255, 255, 0.05);
            border: 1px solid rgba(0, 255, 255, 0.2);
            border-radius: 8px;
        }

        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #00ff00;
            box-shadow: 0 0 10px #00ff00;
            animation: pulse-glow 1.5s infinite;
        }

        .status-dot.idle { background: #666; box-shadow: none; animation: none; }
        .status-dot.running { background: #00ff00; box-shadow: 0 0 10px #00ff00; }
        .status-dot.paused { background: #ffaa00; box-shadow: 0 0 10px #ffaa00; }

        @keyframes pulse-glow {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.2); }
        }

        .status-text {
            color: #00ffff;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .status-count {
            margin-left: auto;
            color: #00ff00;
            font-size: 14px;
            font-weight: bold;
            text-shadow: 0 0 5px #00ff00;
        }

        /* 控制按钮 - 科技感 */
        .control-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 16px;
        }

        .control-btn {
            padding: 12px;
            border: 1px solid;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-family: inherit;
        }

        .btn-start {
            background: rgba(0, 255, 0, 0.1);
            border-color: #00ff00;
            color: #00ff00;
        }
        .btn-start:hover {
            background: rgba(0, 255, 0, 0.2);
            box-shadow: 0 0 15px rgba(0, 255, 0, 0.4);
        }

        .btn-pause {
            background: rgba(255, 170, 0, 0.1);
            border-color: #ffaa00;
            color: #ffaa00;
        }
        .btn-pause:hover {
            background: rgba(255, 170, 0, 0.2);
            box-shadow: 0 0 15px rgba(255, 170, 0, 0.4);
        }

        .btn-submit {
            background: rgba(0, 128, 255, 0.1);
            border-color: #0080ff;
            color: #0080ff;
        }
        .btn-submit:hover {
            background: rgba(0, 128, 255, 0.2);
            box-shadow: 0 0 15px rgba(0, 128, 255, 0.4);
        }

        .btn-collect {
            background: rgba(180, 100, 255, 0.1);
            border-color: #b464ff;
            color: #b464ff;
        }
        .btn-collect:hover {
            background: rgba(180, 100, 255, 0.2);
            box-shadow: 0 0 15px rgba(180, 100, 255, 0.4);
        }

        .export-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .btn-export {
            background: rgba(0, 200, 255, 0.1);
            border-color: #00c8ff;
            color: #00c8ff;
            font-size: 10px;
        }
        .btn-export:hover {
            background: rgba(0, 200, 255, 0.2);
            box-shadow: 0 0 15px rgba(0, 200, 255, 0.4);
        }

        .btn-copy {
            background: rgba(255, 200, 0, 0.1);
            border-color: #ffc800;
            color: #ffc800;
            font-size: 10px;
        }
        .btn-copy:hover {
            background: rgba(255, 200, 0, 0.2);
            box-shadow: 0 0 15px rgba(255, 200, 0, 0.4);
        }

        .btn-bank {
            background: linear-gradient(135deg, rgba(255, 0, 128, 0.2), rgba(128, 0, 255, 0.2));
            border-color: #ff0080;
            color: #ff80c0;
        }
        .btn-bank:hover {
            background: linear-gradient(135deg, rgba(255, 0, 128, 0.3), rgba(128, 0, 255, 0.3));
            box-shadow: 0 0 20px rgba(255, 0, 128, 0.5);
        }

        /* 日志区域 - 终端风格 */
        .log-container {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(0, 255, 255, 0.2);
            border-radius: 6px;
            padding: 10px;
            max-height: 100px;
            overflow-y: auto;
            margin-bottom: 16px;
        }

        .log-title {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 1px solid rgba(0, 255, 255, 0.1);
        }

        .log-content { font-size: 11px; line-height: 1.5; }

        .log-item {
            color: #00ff00;
            padding: 2px 0;
            font-family: 'Consolas', monospace;
        }
        .log-item::before {
            content: '> ';
            color: #00ffff;
        }

        /* 速度控制 - 科技感 */
        .settings-section {
            padding-top: 12px;
            border-top: 1px solid rgba(0, 255, 255, 0.2);
        }

        .setting-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .setting-label {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .speed-value {
            color: #00ffff;
            font-weight: bold;
            font-size: 12px;
            text-shadow: 0 0 5px rgba(0, 255, 255, 0.5);
        }

        .speed-buttons {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
            margin-bottom: 12px;
        }

        .speed-btn {
            padding: 8px 4px;
            border: 1px solid rgba(0, 255, 255, 0.3);
            border-radius: 4px;
            background: transparent;
            color: #888;
            font-size: 10px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-family: inherit;
        }

        .speed-btn:hover {
            border-color: #00ffff;
            color: #00ffff;
        }

        .speed-btn.active {
            border-color: #00ffff;
            background: rgba(0, 255, 255, 0.2);
            color: #00ffff;
            box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
        }

        .slider-container { margin-top: 10px; }

        .speed-slider {
            width: 100%;
            height: 4px;
            border-radius: 2px;
            background: rgba(0, 255, 255, 0.2);
            outline: none;
            -webkit-appearance: none;
        }

        .speed-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #00ffff;
            cursor: pointer;
            box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
        }

        .slider-labels {
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: #666;
            margin-top: 4px;
            text-transform: uppercase;
        }

        .setting-input {
            width: 70px;
            padding: 6px 8px;
            border: 1px solid rgba(0, 255, 255, 0.3);
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.5);
            color: #00ffff;
            font-size: 12px;
            text-align: center;
            font-family: inherit;
        }

        .setting-input:focus {
            outline: none;
            border-color: #00ffff;
            box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
        }

        /* 滚动条 */
        .log-container::-webkit-scrollbar { width: 4px; }
        .log-container::-webkit-scrollbar-track { background: rgba(0, 255, 255, 0.1); }
        .log-container::-webkit-scrollbar-thumb { background: #00ffff; border-radius: 2px; }

        /* 运行动画 */
        #auto-answer-panel.running {
            border-color: rgba(0, 255, 0, 0.5);
            box-shadow: 
                0 0 20px rgba(0, 255, 0, 0.3),
                0 0 40px rgba(0, 255, 0, 0.1);
        }

        #auto-answer-panel.running::before {
            background: linear-gradient(90deg, transparent, #00ff00, #00ffff, #00ff00, transparent);
        }
    `);

    // ==================== 创建 UI 面板 ====================
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'auto-answer-panel';
        panel.innerHTML = `
            <div class="panel-header">
                <div class="panel-title">自动答题</div>
                <button class="minimize-btn" id="minimizeBtn">−</button>
            </div>
            <div class="panel-content">
                <div class="status-indicator">
                    <div class="status-dot idle" id="statusDot"></div>
                    <span class="status-text" id="statusText">待命</span>
                    <span class="status-count" id="statusCount">0/0</span>
                </div>

                <div class="control-buttons">
                    <button class="control-btn btn-start" id="startBtn">▶ 开始答题</button>
                    <button class="control-btn btn-pause" id="pauseBtn" style="display:none;">⏸ 暂停</button>
                    <button class="control-btn btn-submit" id="submitBtn">⬆ 交卷</button>
                    <button class="control-btn btn-bank" id="bankBtn">🎯 题库答题</button>
                </div>
                
                <div class="export-buttons" style="margin-top: 10px;">
                    <button class="control-btn btn-export" id="exportJsonBtn">📁 导出JSON</button>
                    <button class="control-btn btn-copy" id="copyTextBtn">📋 复制答案</button>
                    <button class="control-btn btn-collect" id="collectBtn">📚 仅采集</button>
                </div>
                <div style="font-size: 9px; color: #888; margin-top: 6px; text-align: center;">
                    题库答题：模拟考试用 | 开始答题：练习用
                </div>

                <div class="log-container">
                    <div class="log-title">运行日志</div>
                    <div class="log-content" id="logContent">
                        <div class="log-item">系统已就绪，点击开始</div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="setting-item">
                        <span class="setting-label">速度模式</span>
                        <span class="speed-value" id="speedValue">正常</span>
                    </div>
                    <div class="speed-buttons">
                        <button class="speed-btn" data-speed="2000" data-name="慢速">慢速</button>
                        <button class="speed-btn active" data-speed="800" data-name="正常">正常</button>
                        <button class="speed-btn" data-speed="400" data-name="快速">快速</button>
                        <button class="speed-btn" data-speed="200" data-name="极速">极速</button>
                    </div>
                    <div class="slider-container">
                        <input type="range" class="speed-slider" id="speedSlider" min="100" max="3000" value="${CONFIG.answerDelay}" step="100">
                        <div class="slider-labels">
                            <span>快</span>
                            <span>慢</span>
                        </div>
                    </div>
                    <div class="setting-item" style="margin-top: 10px;">
                        <span class="setting-label">延迟(毫秒)</span>
                        <input type="number" class="setting-input" id="delayInput" value="${CONFIG.answerDelay}" min="100" max="5000" step="100">
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // 绑定事件
        document.getElementById('minimizeBtn').addEventListener('click', toggleMinimize);
        document.getElementById('startBtn').addEventListener('click', startAutoAnswer);
        document.getElementById('pauseBtn').addEventListener('click', togglePause);
        document.getElementById('submitBtn').addEventListener('click', submitExam);
        document.getElementById('bankBtn').addEventListener('click', startQuestionBankMode);
        document.getElementById('collectBtn').addEventListener('click', startCollectOnly);
        document.getElementById('exportJsonBtn').addEventListener('click', exportToJSON);
        document.getElementById('copyTextBtn').addEventListener('click', copyToClipboard);
        document.getElementById('delayInput').addEventListener('change', updateDelay);
        document.getElementById('speedSlider').addEventListener('input', updateSpeedSlider);
        
        // 绑定速度按钮事件
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const speed = parseInt(this.dataset.speed);
                const name = this.dataset.name;
                setSpeed(speed, name, this);
            });
        });

        // 初始化统计
        initStats();
    }

    // ==================== UI 交互函数 ====================
    function toggleMinimize() {
        const panel = document.getElementById('auto-answer-panel');
        panel.classList.toggle('minimized');
        const btn = document.getElementById('minimizeBtn');
        btn.textContent = panel.classList.contains('minimized') ? '🤖' : '−';
    }

    function updateDelay(e) {
        const value = parseInt(e.target.value) || 800;
        CONFIG.answerDelay = value;
        document.getElementById('speedSlider').value = value;
        updateSpeedName(value);
        log(`答题延迟已设置为 ${CONFIG.answerDelay}ms`);
    }

    function updateSpeedSlider(e) {
        const value = parseInt(e.target.value);
        CONFIG.answerDelay = value;
        document.getElementById('delayInput').value = value;
        updateSpeedName(value);
        
        // 更新按钮状态
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.remove('active');
            if (parseInt(btn.dataset.speed) === value) {
                btn.classList.add('active');
            }
        });
    }

    function setSpeed(speed, name, btn) {
        CONFIG.answerDelay = speed;
        document.getElementById('delayInput').value = speed;
        document.getElementById('speedSlider').value = speed;
        document.getElementById('speedValue').textContent = name;
        
        // 更新按钮状态
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        log(`速度已设置为 ${name} (${speed}ms)`);
    }

    function updateSpeedName(value) {
        let name = '自定义';
        if (value >= 1500) name = '慢速';
        else if (value >= 600) name = '正常';
        else if (value >= 300) name = '快速';
        else name = '极速';
        document.getElementById('speedValue').textContent = name;
    }

    function updateStats() {
        // 更新状态计数器
        const countEl = document.getElementById('statusCount');
        if (countEl) {
            countEl.textContent = `${processedCount}/${totalQuestions}`;
        }
    }
    
    function updateStatus(status) {
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        
        if (dot && text) {
            dot.className = 'status-dot ' + status;
            const statusMap = {
                'idle': '待命',
                'running': '运行中',
                'paused': '已暂停'
            };
            text.textContent = statusMap[status] || '待命';
        }
    }

    function updateLog(message) {
        const logContent = document.getElementById('logContent');
        if (logContent) {
            const logItem = document.createElement('div');
            logItem.className = 'log-item';
            logItem.textContent = message;
            logContent.insertBefore(logItem, logContent.firstChild);
            
            // 保留最近20条日志
            while (logContent.children.length > 20) {
                logContent.removeChild(logContent.lastChild);
            }
        }
    }

    function initStats() {
        // 获取总题数（从进度列表中统计）
        const questionItems = document.querySelectorAll('.m-testlist li');
        totalQuestions = questionItems.length;
        
        // 获取已完成题数
        const completedItems = document.querySelectorAll('.m-testlist li.over');
        processedCount = completedItems.length;
        correctCount = completedItems.length;
        
        // 获取当前题号
        const currentText = document.querySelector('.m-questiontitle span.f-left');
        if (currentText) {
            const match = currentText.textContent.match(/第(\d+)题/);
            if (match) {
                currentQuestion = parseInt(match[1]);
            }
        }
        
        updateStats();
        log(`检测到 ${totalQuestions} 道题，已完成 ${processedCount} 道`, 'info');
    }

    // ==================== 核心答题函数 ====================
    async function startAutoAnswer() {
        if (isRunning) return;
        
        isRunning = true;
        isPaused = false;
        collectedAnswers = [];  // 清空采集数组，重新开始采集
        
        const panel = document.getElementById('auto-answer-panel');
        panel.classList.add('running');
        
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('pauseBtn').style.display = 'block';
        
        updateStatus('running');
        initStats();  // 重新获取题目数
        log('开始自动答题...', 'success');
        
        await processQuestions();
    }

    function togglePause() {
        isPaused = !isPaused;
        const pauseBtn = document.getElementById('pauseBtn');
        
        if (isPaused) {
            pauseBtn.innerHTML = '▶ 继续';
            updateStatus('paused');
            log('已暂停', 'warning');
        } else {
            pauseBtn.innerHTML = '⏸ 暂停';
            updateStatus('running');
            log('继续答题', 'success');
        }
    }

    async function processQuestions() {
        while (isRunning) {
            if (isPaused) {
                await sleep(500);
                continue;
            }

            // 检查是否还有未做的题
            const hasMore = await processCurrentQuestion();
            
            if (!hasMore) {
                log('所有题目已完成！', 'success');
                stopAutoAnswer();
                break;
            }
            
            await sleep(CONFIG.nextDelay);
        }
    }

    async function processCurrentQuestion() {
        try {
            // 1. 获取当前题号
            const titleEl = document.querySelector('.m-questiontitle span.f-left');
            let questionNum = 0;
            if (titleEl) {
                const match = titleEl.textContent.match(/第(\d+)题/);
                if (match) {
                    questionNum = parseInt(match[1]);
                    currentQuestion = questionNum;
                }
            }
            
            // 检查当前题目是否已完成（跳过已做过的题）
            const questionItems = document.querySelectorAll('.m-testlist li');
            if (questionNum > 0 && questionNum <= questionItems.length) {
                const currentItem = questionItems[questionNum - 1];
                if (currentItem && currentItem.classList.contains('over')) {
                    log(`第${questionNum}题 已完成，跳过`, 'info');
                    return await goToNextQuestion();
                }
            }
            
            log(`第${questionNum}题 处理中...`, 'info');
            
            // 获取题目内容用于采集
            const questionTitle = document.querySelector('.m-questiontitle');
            let questionText = questionTitle ? questionTitle.textContent.replace(/第\d+题/, '').trim() : '';
            
            // 获取选项用于采集
            const optionsList = [];
            const optionElements = document.querySelectorAll('.m-question dd');
            for (const opt of optionElements) {
                const text = opt.textContent.trim();
                if (text) optionsList.push(text);
            }
            
            // 判断题型
            const isMultiple = document.querySelector('.m-question dd input[type="checkbox"]') !== null;
            const questionType = isMultiple ? '多选题' : '单选题';
            
            // 2. 检测题型：情景分析题有多个小题（每个小题有独立的查看答案按钮）
            const allViewAnswerBtns = document.querySelectorAll('dt span.f-right, dt div[class*="f-right"]');
            const viewAnswerBtns = Array.from(allViewAnswerBtns).filter(el => 
                el.textContent.includes('查看答案')
            );
            
            if (viewAnswerBtns.length === 0) {
                // 备用选择器
                const altBtns = Array.from(document.querySelectorAll('dt span, dt div')).filter(el => 
                    el.textContent.includes('查看答案')
                );
                if (altBtns.length === 0) {
                    log(`第${questionNum}题 找不到查看答案按钮`, 'error');
                    return false;
                }
                viewAnswerBtns.push(...altBtns);
            }
            
            let collectedAnswer = '';  // 用于记录本题答案
            
            // 3. 情景分析题：多个小题
            if (viewAnswerBtns.length > 1) {
                log(`第${questionNum}题 情景分析题(${viewAnswerBtns.length}小题)`, 'info');
                let subAnswers = [];
                
                for (let i = 0; i < viewAnswerBtns.length; i++) {
                    const btn = viewAnswerBtns[i];
                    const subQuestionNum = `${questionNum}-${i + 1}`;
                    
                    // 点击查看答案
                    btn.click();
                    await sleep(300);
                    
                    // 获取答案
                    const answer = await getAnswerFromIframe();
                    closeAnswerDialog();
                    
                    if (answer) {
                        log(`${subQuestionNum} 答案: ${answer}`, 'success');
                        subAnswers.push(`${i + 1}:${answer}`);
                        // 选择该小题的答案（需要找到对应的选项区域）
                        await selectSubQuestionAnswer(btn, answer);
                    } else {
                        log(`${subQuestionNum} 获取答案失败`, 'warning');
                    }
                    
                    await sleep(200);
                }
                collectedAnswer = subAnswers.join(', ');
            } else {
                // 4. 普通题型：单个题目
                const viewAnswerBtn = viewAnswerBtns[0];
                viewAnswerBtn.click();
                await sleep(200);
                
                const answer = await getAnswerFromIframe(questionNum);
                closeAnswerDialog();
                
                if (!answer) {
                    log(`第${questionNum}题 获取答案失败`, 'error');
                    return await goToNextQuestion();
                }
                
                collectedAnswer = answer;
                log(`第${questionNum}题 答案: ${answer}`, 'success');
                await selectAnswer(answer);
            }
            
            // ★ 答题时自动采集答案
            if (collectedAnswer) {
                collectedAnswers.push({
                    questionNum: questionNum,
                    questionType: questionType,
                    questionText: questionText,
                    options: optionsList,
                    answer: collectedAnswer
                });
            }
            
            await sleep(300);
            
            // 5. 点击确定并下一题
            const result = await goToNextQuestion();
            
            processedCount++;
            correctCount++;
            updateStats();
            
            // 检查是否是最后一题
            if (totalQuestions > 0 && questionNum >= totalQuestions) {
                log(`第${questionNum}题 已是最后一题`, 'success');
                log(`✅ 已采集 ${collectedAnswers.length} 道题答案，可点击导出`, 'success');
                return false;
            }
            
            return result;
            
        } catch (error) {
            log(`错误: ${error.message}`, 'error');
            return await goToNextQuestion();
        }
    }
    
    // 情景分析题：选择特定小题的答案
    async function selectSubQuestionAnswer(viewAnswerBtn, answer) {
        // 找到该小题对应的选项区域
        // 结构: term > [题目, 查看答案按钮] + 后续的 definition 元素
        const term = viewAnswerBtn.closest('dt') || viewAnswerBtn.closest('[class*="term"]') || viewAnswerBtn.parentElement?.parentElement;
        if (!term) {
            log('找不到题目容器', 'warning');
            return;
        }
        
        // 找到该term后面的所有dd/definition元素（选项）
        const options = [];
        let sibling = term.nextElementSibling;
        while (sibling) {
            // 检查是否是选项元素
            const tagName = sibling.tagName?.toLowerCase();
            const hasInput = sibling.querySelector('input[type="radio"], input[type="checkbox"]');
            
            if (tagName === 'dd' || hasInput || sibling.getAttribute('role') === 'definition') {
                options.push(sibling);
            } else if (tagName === 'dt' || sibling.getAttribute('role') === 'term') {
                // 遇到下一个题目，停止
                break;
            }
            sibling = sibling.nextElementSibling;
        }
        
        // 选择答案
        const answers = answer.split('').filter(a => /[A-Z]/.test(a));
        for (const ans of answers) {
            for (const option of options) {
                const text = option.textContent.trim();
                if (text.startsWith(ans + '.') || text.startsWith(ans + '、') || text.match(new RegExp(`^${ans}[.、\\s]`))) {
                    const input = option.querySelector('input[type="radio"], input[type="checkbox"]');
                    if (input && !input.checked) {
                        input.click();
                        log(`✓ 选择 ${ans}`, 'success');
                        await sleep(100);
                    }
                    break;
                }
            }
        }
    }

    async function getAnswerFromIframe(expectedQuestionNum) {
        return new Promise((resolve) => {
            // 等待iframe加载
            setTimeout(() => {
                try {
                    // 查找layui弹窗中的iframe（确保是最新的弹窗）
                    const layers = document.querySelectorAll('.layui-layer');
                    let targetIframe = null;
                    
                    // 找到最新的弹窗中的iframe
                    for (const layer of layers) {
                        const iframe = layer.querySelector('iframe');
                        if (iframe && iframe.src && iframe.src.includes('answer=')) {
                            targetIframe = iframe;
                        }
                    }
                    
                    // 如果没找到，尝试直接查找
                    if (!targetIframe) {
                        targetIframe = document.querySelector('iframe[src*="answer="]');
                    }
                    
                    if (targetIframe && targetIframe.src) {
                        const url = new URL(targetIframe.src);
                        const answer = url.searchParams.get('answer');
                        if (answer) {
                            resolve(answer);
                            return;
                        }
                        
                        // 备用：从 URL 路径中匹配 answer 参数
                        const srcMatch = targetIframe.src.match(/[?&]answer=([A-Z]+)/i);
                        if (srcMatch) {
                            resolve(srcMatch[1]);
                            return;
                        }
                    }
                    
                    // 方案2: 尝试直接访问 iframe 内容（同源情况）
                    if (targetIframe && targetIframe.contentDocument) {
                        const answerCell = targetIframe.contentDocument.querySelector('td');
                        if (answerCell) {
                            const answerText = answerCell.textContent.trim();
                            resolve(answerText);
                            return;
                        }
                    }
                    
                    // 方案3: 从页面中查找答案元素
                    const answerElements = document.querySelectorAll('td, .answer, [class*="answer"]');
                    for (const el of answerElements) {
                        const text = el.textContent.trim();
                        const match = text.match(/^[A-Z]+$/);
                        if (match) {
                            resolve(match[0]);
                            return;
                        }
                    }
                    
                    resolve(null);
                } catch (e) {
                    console.error('获取答案出错:', e);
                    resolve(null);
                }
            }, 500);
        });
    }

    function closeAnswerDialog() {
        // 方案1: 查找关闭链接（最常见）
        const closeLinks = document.querySelectorAll('a[href="javascript:void(0);"]');
        for (const link of closeLinks) {
            if (link.textContent.includes('关闭')) {
                link.click();
                return;
            }
        }
        
        // 方案2: layui 弹窗关闭按钮
        const closeSelectors = [
            '.layui-layer-close',
            '.layui-layer-close1', 
            '.layui-layer-close2',
            '.layui-layer-setwin .layui-layer-close'
        ];
        
        for (const selector of closeSelectors) {
            const closeBtn = document.querySelector(selector);
            if (closeBtn) {
                closeBtn.click();
                return;
            }
        }
        
        // 方案3: 点击遮罩层关闭
        const shade = document.querySelector('.layui-layer-shade');
        if (shade) {
            shade.click();
            return;
        }
        
        // 方案4: 使用 layui 的关闭方法
        if (window.layer) {
            window.layer.closeAll();
        }
    }

    async function selectAnswer(answer) {
        // 判断是单选还是多选
        const isMultiple = document.querySelector('.m-question dd input[type="checkbox"]') !== null;
        
        // 解析答案字母
        const answers = answer.split('').filter(c => /[A-Z]/.test(c));
        
        log(`选择答案: ${answers.join(', ')} (${isMultiple ? '多选' : '单选'})`, 'info');
        
        for (const ans of answers) {
            // 方法1: 通过value属性直接选择
            const inputByValue = document.querySelector(`.m-question dd input[value="${ans}"]`);
            if (inputByValue && !inputByValue.checked) {
                inputByValue.click();
                log(`✓ 选择选项 ${ans}`, 'success');
                await sleep(100);
                continue;
            }
            
            // 方法2: 遍历选项查找
            const options = document.querySelectorAll('.m-question dd');
            for (const option of options) {
                const text = option.textContent.trim();
                if (text.startsWith(ans + '.') || text.startsWith(ans + '、') || text.startsWith(ans + ' ')) {
                    const input = option.querySelector('input[type="radio"], input[type="checkbox"]');
                    if (input && !input.checked) {
                        input.click();
                        log(`✓ 选择选项 ${ans}`, 'success');
                        await sleep(100);
                    }
                    break;
                }
            }
        }
    }

    async function goToNextQuestion() {
        // 查找"确定并下一题"按钮
        const nextBtn = document.querySelector('.m-btns a.btn-primary') ||
                        document.querySelector('.m-btns .u-button.btn-primary') ||
                        Array.from(document.querySelectorAll('.m-btns a, .m-btns span')).find(el => 
                            el.textContent.includes('确定并下一题') || el.textContent.includes('下一题')
                        );
        
        if (nextBtn) {
            const oldQuestion = currentQuestion;
            nextBtn.click();
            log(`点击下一题按钮`, 'info');
            await sleep(CONFIG.answerDelay);
            
            // 检查是否出现确认弹窗（最后一题可能会提示）
            await sleep(500);
            const confirmBtn = document.querySelector('.layui-layer-btn0');
            if (confirmBtn) {
                // 检查是否是"已答完所有题目"的弹窗
                const layerContent = document.querySelector('.layui-layer-content');
                if (layerContent && layerContent.textContent.includes('已答完')) {
                    const cancelBtn = document.querySelector('.layui-layer-btn1');
                    if (cancelBtn) {
                        cancelBtn.click();
                    }
                    return false;  // 所有题目已完成
                }
            }
            
            // 等待页面更新
            await sleep(300);
            
            // 检查题号是否变化
            const newTitle = document.querySelector('.m-questiontitle span.f-left');
            if (newTitle) {
                const match = newTitle.textContent.match(/第(\d+)题/);
                if (match) {
                    const newNum = parseInt(match[1]);
                    if (newNum !== oldQuestion) {
                        currentQuestion = newNum;
                        return true;  // 成功进入下一题
                    }
                }
            }
            
            // 如果题号没变化，可能已经是最后一题
            return true;  // 默认返回true继续尝试
        }
        
        log('找不到下一题按钮', 'warning');
        return false;
    }

    function submitExam() {
        // 查找交卷按钮
        const submitBtn = document.querySelector('.submitbtn') ||
                         document.querySelector('a.u-button.submitbtn') ||
                         Array.from(document.querySelectorAll('a, button, span')).find(el => 
                             el.textContent.trim() === '交卷'
                         );
        
        if (submitBtn) {
            submitBtn.click();
            log('已点击交卷按钮', 'success');
        } else {
            log('找不到交卷按钮', 'warning');
        }
    }

    function stopAutoAnswer() {
        isRunning = false;
        isPaused = false;
        
        const panel = document.getElementById('auto-answer-panel');
        panel.classList.remove('running');
        
        document.getElementById('startBtn').style.display = 'block';
        document.getElementById('pauseBtn').style.display = 'none';
        
        updateStatus('idle');
        log('答题已停止', 'info');
    }

    // ==================== 题库答题模式（模拟考试用）====================
    // 初始化题库数据（432道去重题库，从1-6.json合并提取）
    function initQuestionBank() {
        // 完整题库数据（通过选项匹配答案）
        const bankData = [
{options: ["A.策划直播主题","B.直播前的预热","C.折扣秒杀专场","D.线下宣传推广"], answer: "B"},
{options: ["A.品牌商","B.MCN机构","C.主播","D.消费者"], answer: "C"},
{options: ["A.人","B.货","C.场","D.品"], answer: "A"},
{options: ["A.做策划","B.开直播","C.去库存","D.做推广"], answer: "C"},
{options: ["A.直播开场","B.直播中场","C.直播过程","D.直播收尾"], answer: "C"},
{options: ["A.快手","B.抖音","C.淘宝","D.腾讯"], answer: "B"},
{options: ["A.直播电商","B.短视频电商","C.货架式电商","D.电视购物"], answer: "D"},
{options: ["A.内容电商","B.社交电商","C.直播电商","D.传统电商"], answer: "C"},
{options: ["A.增加了购物的体验","B.去库存","C.品牌营销","D.缩短供应链的成本"], answer: "A"},
{options: ["A.电子商务","B.电子商务运营","C.直播电商","D.直播电商运营"], answer: "B"},
{options: ["A.MCN机构","B.批发商","C.经销商","D.用户"], answer: "A"},
{options: ["A.产品","B.用户","C.数据","D.理念"], answer: "A"},
{options: ["A.库存","B.销售","C.用户","D.财务"], answer: "A"},
{options: ["A.商家自播","B.达人主播","C.名人主播","D.机构主播"], answer: "A"},
{options: ["A.良好的颜值","B.专业的知识","C.品牌的知名度","D.强大的导购能力"], answer: "BD"},
{options: ["A.平台主播","B.名人+主播联播","C.特色主播","D.商家自播"], answer: "ABCD"},
{options: ["A.开启同城定位","B.定期直播","C.设计好看的封面和标题","D.分享直播二维码"], answer: "ABCD"},
{options: ["A.较好的颜值","B.良好的职业道德","C.专业的知识素养","D.良好的岗位技能"], answer: "BCD"},
{options: ["A.商家单纯依靠外部主播来售卖商品，而商家自身不生产商品","B.品牌方与主播双向选择，使商品与主播风格匹配度更高","C.库存压力小，供应链的库存风险较低","D.主播处于被动地位，选择的主导权在品牌方手里"], answer: "BCD"},
{options: ["A.品牌商","B.MCN机构","C.主播","D.消费者","E.直播电商平台"], answer: "ABCDE"},
{options: ["A.信赖模式不同","B.场景模式不同","C.售后服务模式不同","D.用户不同"], answer: "ABC"},
{options: ["A.道具","B.编程","C.数据","D.信息安全"], answer: "ABCD"},
{options: ["A.吸引粉丝","B.品牌推广","C.去库存","D.增加流量"], answer: "BC"},
{options: ["A.纯直播预告","B.给优惠","C.视频植入预告","D.拍直播片段视频"], answer: "ABCD"},
{options: ["A.微博","B.微信","C.小红书","D.今日头条"], answer: "ABCD"},
{options: ["A.直播预热文案引流","B.短视频引流推广","C.付费推广引流","D.其他直播引流推广方式"], answer: "ABCD"},
{options: ["A.主播筛选和孵化","B.内容的开发","C.内容平台技术支持","D.持续性的创意输出"], answer: "ABCD"},
{options: ["A.开播时间","B.地点","C.流程","D.内容"], answer: "AD"},
{options: ["A.直播宣传海报","B.H5活动页","C.推广软文","D.直播介绍短视频"], answer: "ABCD"},
{options: ["A.话术设计口语化，富有感染力","B.将话术作为模板套用","C.话术配合情绪表达","D.语速和语调适中"], answer: "ACD"},
{options: ["A.用颜值吸引用户","B.用陪伴建立习惯","C.用互动强化印象","D.用推荐实现变现"], answer: "BCD"},
{options: ["A.库管","B.采购","C.分拣打包","D.打单发货"], answer: "ABCD"},
{options: ["A.确认直播场地","B.提示用户关注主播","C.主播离席时及时补位","D.全方位配合主播"], answer: "ABCD"},
{options: ["A.通过MCN机构对接主播","B.商家自播","C.主播自荐","D.随意选择"], answer: "AB"},
{options: ["A.淘宝直播","B.小鹅通","C.美拍","D.千聊"], answer: "BD"},
{options: ["A.增加了购物的体验","B.降低了信息获取的成本","C.品牌营销","D.缩短供应链的成本"], answer: "AB"},
{options: ["A.品牌专场","B.单类目专场","C.单类目混场","D.多类目混场"], answer: "D"},
{options: ["A.真实性","B.趣味性","C.连贯性","D.创新性"], answer: "A"},
{options: ["A.兔宝宝妈咪（推荐母婴用品）","B.大胃王楚楚（推荐日用品）","C.小仙女美美（推荐美妆）","D.王阿婆卖瓜（推荐香瓜）"], answer: "B"},
{options: ["A.场景专题","B.专业测试","C.新品试用","D.粉丝回馈"], answer: "D"},
{options: ["A.对直播内容进行创新","B.对直播内容进行连贯","C.主播供给的直播内容市场，要和粉丝的需求市场相匹配","D.对直播内容进行表演"], answer: "C"},
{options: ["A.极端式促销","B.最低额促销","C.回报返利促销","D.最高额促销"], answer: "C"},
{options: ["A.单品解说","B.整场直播","C.品牌直播","D.综合直播"], answer: "A"},
{options: ["A.淘宝直播","B.抖音","C.快手","D.小红书"], answer: "A"},
{options: ["A.引流款","B.秒杀款","C.利润款","D.清仓款"], answer: "C"},
{options: ["A.粉丝活动日","B.粉丝回馈","C.高端展示","D.活动专属"], answer: "C"},
{options: ["A.内容简介要简单扼要不拖沓，有吸引力且有行动点的文案","B.直播中不允许主播口播提及的内容可以写在直播简介里面","C.介绍本场直播的嘉宾，特色场景，主打商品","D.内容简介可以写入粉丝福利介绍"], answer: "B"},
{options: ["A.混场","B.单类目","C.品牌专场","D.单类目混场"], answer: "A"},
{options: ["A.直播内容","B.直播平台","C.直播间空间设置","D.主播的表演风格"], answer: "A"},
{options: ["A.为粉丝带来开心快乐","B.为粉丝坚定购买决心","C.为粉丝增长见识","D.激起粉丝消费欲望"], answer: "C"},
{options: ["A.直播内容","B.直播脚本","C.直播流程","D.直播话术"], answer: "B"},
{options: ["A.大众好感度低","B.市场需求小","C.销售周期短","D.价格昂贵"], answer: "C"},
{options: ["A.主播的说话内容","B.参与人的说话内容","C.直播现场的环境","D.粉丝在公屏的打字内容"], answer: "C"},
{options: ["A.KOL","B.KOC","C.IP","D.MCN"], answer: "C"},
{options: ["A.搭景直播","B.实体店直播","C.产地直播","D.海淘现场直播"], answer: "C"},
{options: ["A.直播中播放新闻、游戏、电视剧、动漫、综艺节目等","B.在直播间和粉丝聊家常，把宠物猫带来给粉丝看","C.在直播间抽烟","D.在直播间公布微信或手机号字样或口述加微信"], answer: "B"},
{options: ["A.品牌间差异小","B.购物决策时间短","C.对主播专业化要求高","D.库存量大，品类丰富"], answer: "C"},
{options: ["A.高退货率","B.低体验感","C.高客单价","D.高毛利"], answer: "D"},
{options: ["A.让用户进入粉丝群，在群内发红包","B.介绍完一款商品后立刻发红包","C.拿着手机对着镜头展示抢红包的人数","D.让用户关注主播"], answer: "B"},
{options: ["A.客单价高，性价比低","B.客单价高，性价比高","C.客单价低，性价比低","D.客单价低，性价比高"], answer: "D"},
{options: ["A.选择直播产品","B.定好直播主题","C.规划直播脚本","D.策划直播内容"], answer: "A"},
{options: ["A.唇部","B.眼部","C.底妆","D.腮红"], answer: "D"},
{options: ["A.主播的手部动作","B.主播的发型","C.主播的脸部表情","D.主播的腿部动作"], answer: "C"},
{options: ["A.导购促销类","B.技能专家类","C.明星网红类","D.其他选项都不是"], answer: "B"},
{options: ["A.低领毛衣","B.宽松的立领毛衣","C.堆堆领打底衫","D.百褶领毛衣"], answer: "A"},
{options: ["A.一级痛点","B.二级痛点","C.三级痛点","D.无法对比"], answer: "A"},
{options: ["A.体貌","B.角色","C.性格","D.带货"], answer: "D"},
{options: ["A.底妆","B.修容","C.眼妆","D.口红"], answer: "B"},
{options: ["A.盘点主播的辨识度","B.确定直播的行业","C.发掘观众的需求","D.塑造一个虚拟的形象"], answer: "D"},
{options: ["A.潜在需求市场","B.模糊需求市场","C.精准需求市场","D.所有粉丝市场"], answer: "C"},
{options: ["A.吐字不圆润","B.吐字含混","C.咬字不准","D.语速过快"], answer: "B"},
{options: ["A.设定价格锚点","B.设计选项","C.优先罗列商品卖点","D.以上均可"], answer: "A"},
{options: ["A.1天1-2次","B.1天3-4次","C.1周1-2次","D.1周3-4次"], answer: "A"},
{options: ["A.直播内容具有观赏性","B.产品价格足够低","C.主播真诚，内容真实","D.主播具有精湛演技"], answer: "C"},
{options: ["A.7：00","B.12：00","C.15：00","D.20：00"], answer: "D"},
{options: ["A.蓝底","B.红底","C.白底","D.深色底"], answer: "C"},
{options: ["A.1","B.2","C.5","D.10"], answer: "C"},
{options: ["A.夸大功效","B.借势热点","C.激发好奇心","D.设置利益点"], answer: "A"},
{options: ["A.新旧用户互动量低","B.新用户参与互动不佳，成交量少","C.老用户参与活动不佳，成交量少","D.新增用户数量少"], answer: "A"},
{options: ["A.5%-20%","B.10%-25%","C.15%-30%","D.20%-35%"], answer: "A"},
{options: ["A.退换单数/成交单数","B.成交单数/退换单数","C.成交单数/未成交单数（下单未购买）","D.未成交单数（下单未购买）/成交单数"], answer: "A"},
{options: ["A.新增粉丝数","B.在线人数","C.评论人数","D.观看人次"], answer: "B"},
{options: ["A.10%-30%","B.30%-50%","C.20%-40%","D.50%-70%"], answer: "B"},
{options: ["A.高点击高转化","B.高点击低转化","C.低点击高转化","D.低点击低转化"], answer: "A"},
{options: ["A.成交单量/新增粉丝数*100%","B.成交单量/观看人次*100%","C.成交单量/粉丝人数*100%","D.成交单量/在线人数*100%"], answer: "D"},
{options: ["A.帮助直播创作者了解自己的用户","B.帮助直播创作者调整粉丝数据结构","C.帮助直播创作者多维度对比不同账号，进而取长补短","D.帮助直播创作者对全部用户特征做洞察分析"], answer: "C"}
        ];
        
        // 将题库数据转换为Map，使用标准化的key
        bankData.forEach(item => {
            // 标准化选项后排序作为key
            const normalizedOptions = item.options.map(opt => normalizeOptionText(opt));
            const key = normalizedOptions.slice().sort().join('|');
            QUESTION_BANK.set(key, item.answer);
            
            // 同时存储仅内容的key（去掉字母前缀）
            const contentOptions = item.options.map(opt => normalizeOptionText(extractOptionContent(opt)));
            const contentKey = contentOptions.slice().sort().join('|');
            if (!QUESTION_BANK.has(contentKey)) {
                QUESTION_BANK.set(contentKey, item.answer);
            }
        });
        
        log(`题库已加载，共 ${QUESTION_BANK.size} 条匹配规则`, 'info');
    }
    
    // 标准化选项文本：去除空白、统一格式（提前声明供initQuestionBank使用）
    function normalizeOptionText(text) {
        return text
            .replace(/\s+/g, '')           // 去除所有空白字符
            .replace(/[""]/g, '"')         // 统一引号
            .replace(/['']/g, "'")         // 统一单引号
            .replace(/（/g, '(')           // 统一括号
            .replace(/）/g, ')')
            .replace(/：/g, ':')           // 统一冒号
            .replace(/，/g, ',')           // 统一逗号
            .toLowerCase()                  // 转小写便于比较
            .trim();
    }
    
    // 提取选项核心内容（去掉选项字母前缀）
    function extractOptionContent(text) {
        // 移除 "A." "A、" "A " 等前缀
        return text.replace(/^[A-Za-z][.、\s]?\s*/, '').trim();
    }
    
    // 根据选项匹配答案 - 使用多种策略
    function matchAnswerFromBank(options) {
        // 策略1: 精确匹配（标准化后）
        const normalizedOptions = options.map(opt => normalizeOptionText(opt));
        const key1 = normalizedOptions.slice().sort().join('|');
        if (QUESTION_BANK.has(key1)) {
            return QUESTION_BANK.get(key1);
        }
        
        // 策略2: 仅匹配选项内容（去掉字母前缀后）
        const contentOptions = options.map(opt => normalizeOptionText(extractOptionContent(opt)));
        const key2 = contentOptions.slice().sort().join('|');
        if (QUESTION_BANK.has(key2)) {
            return QUESTION_BANK.get(key2);
        }
        
        // 策略3: 遍历题库进行模糊匹配
        for (const [bankKey, answer] of QUESTION_BANK.entries()) {
            const bankOptions = bankKey.split('|');
            
            // 检查选项数量是否一致
            if (bankOptions.length !== options.length) continue;
            
            // 检查每个选项是否能模糊匹配
            let matchCount = 0;
            for (const opt of normalizedOptions) {
                for (const bankOpt of bankOptions) {
                    // 包含关系匹配
                    if (opt.includes(bankOpt) || bankOpt.includes(opt)) {
                        matchCount++;
                        break;
                    }
                    // 核心内容匹配（去掉字母前缀）
                    const optContent = normalizeOptionText(extractOptionContent(opt));
                    const bankContent = normalizeOptionText(extractOptionContent(bankOpt));
                    if (optContent === bankContent || 
                        optContent.includes(bankContent) || 
                        bankContent.includes(optContent)) {
                        matchCount++;
                        break;
                    }
                }
            }
            
            // 如果所有选项都匹配成功
            if (matchCount === options.length) {
                console.log('🎯 模糊匹配成功:', options, '→', answer);
                return answer;
            }
        }
        
        // 调试：输出未匹配的选项信息
        console.log('❌ 题库未匹配，当前选项:', options);
        console.log('❌ 标准化后:', normalizedOptions);
        
        return null;
    }
    
    // 启动题库答题模式
    async function startQuestionBankMode() {
        if (isRunning) return;
        
        // 初始化题库
        if (QUESTION_BANK.size === 0) {
            initQuestionBank();
        }
        
        isRunning = true;
        isPaused = false;
        isQuestionBankMode = true;
        processedCount = 0;
        correctCount = 0;
        
        const panel = document.getElementById('auto-answer-panel');
        panel.classList.add('running');
        
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('bankBtn').style.display = 'none';
        document.getElementById('pauseBtn').style.display = 'block';
        
        updateStatus('running');
        initStats();
        log('🎯 题库答题模式启动...', 'success');
        
        await processQuestionBankMode();
    }
    
    // 题库答题主循环
    async function processQuestionBankMode() {
        const questionItems = document.querySelectorAll('.m-testlist li');
        totalQuestions = questionItems.length;
        
        for (let i = 0; i < totalQuestions && isRunning; i++) {
            if (isPaused) {
                await sleep(500);
                i--;
                continue;
            }
            
            processedCount = i + 1;
            updateStats();
            
            // 点击题目跳转
            const questionItem = questionItems[i];
            const link = questionItem.querySelector('a');
            if (link) {
                link.click();
                await sleep(CONFIG.answerDelay);
            }
            
            // 处理当前题目
            const success = await processQuestionWithBank(i + 1);
            if (success) {
                correctCount++;
            }
            
            await sleep(200);
        }
        
        // 答题完成
        if (isRunning) {
            log(`✅ 题库答题完成！成功 ${correctCount}/${totalQuestions} 题`, 'success');
        }
        
        stopQuestionBankMode();
    }
    
    // 使用题库处理单个题目
    async function processQuestionWithBank(questionNum) {
        try {
            // 获取当前题目选项
            const optionElements = document.querySelectorAll('.m-question dd');
            const options = [];
            for (const opt of optionElements) {
                const text = opt.textContent.trim();
                if (text) options.push(text);
            }
            
            if (options.length === 0) {
                log(`第${questionNum}题 获取选项失败`, 'error');
                return false;
            }
            
            // 从题库匹配答案
            const answer = matchAnswerFromBank(options);
            
            if (!answer) {
                log(`第${questionNum}题 题库未匹配，点击跳过`, 'warning');
                // 点击"跳过"按钮
                await clickSkipButton();
                return false;
            }
            
            log(`第${questionNum}题 匹配答案: ${answer}`, 'success');
            
            // 选择答案
            await selectAnswer(answer);
            await sleep(300);
            
            // 点击确定并下一题 - 使用goToNextQuestion函数
            const result = await goToNextQuestion();
            if (!result) {
                log(`第${questionNum}题 无法点击下一题`, 'warning');
            }
            
            return result;
        } catch (error) {
            log(`第${questionNum}题 处理出错: ${error.message}`, 'error');
            return false;
        }
    }
    
    // 点击"跳过"按钮
    async function clickSkipButton() {
        // 查找"跳过"按钮 - 精确匹配文本为"跳过"的按钮
        const skipBtn = Array.from(document.querySelectorAll('.m-btns a.u-button, .m-btns a.btn-default, .m-btns a')).find(el => 
                            el.textContent.trim() === '跳过'
                        ) ||
                        Array.from(document.querySelectorAll('[class*="btns"] a, [class*="btns"] span')).find(el => 
                            el.textContent.trim() === '跳过'
                        );
        
        if (skipBtn) {
            skipBtn.click();
            log(`📌 点击跳过按钮`, 'info');
            await sleep(CONFIG.answerDelay);
            
            // 等待页面更新
            await sleep(300);
            return true;
        }
        
        // 备用方案：直接点击下一题
        log(`⚠️ 找不到跳过按钮，尝试点击下一题`, 'warning');
        return await goToNextQuestion();
    }
    
    // 停止题库答题模式
    function stopQuestionBankMode() {
        isRunning = false;
        isPaused = false;
        isQuestionBankMode = false;
        
        const panel = document.getElementById('auto-answer-panel');
        panel.classList.remove('running');
        
        document.getElementById('startBtn').style.display = 'block';
        document.getElementById('bankBtn').style.display = 'block';
        document.getElementById('pauseBtn').style.display = 'none';
        
        updateStatus('idle');
        log('题库答题已停止', 'info');
    }

    // ==================== 答案采集功能 ====================
    // 纯采集模式：只采集答案不选择
    async function startCollectOnly() {
        if (isRunning) return;
        
        isRunning = true;
        isPaused = false;
        isCollectMode = true;
        collectedAnswers = [];
        
        const panel = document.getElementById('auto-answer-panel');
        panel.classList.add('running');
        
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('collectBtn').style.display = 'none';
        document.getElementById('pauseBtn').style.display = 'block';
        
        updateStatus('running');
        initStats();
        log('开始采集答案（不选择）...', 'success');
        
        await collectAllAnswers();
    }
    
    async function collectAllAnswers() {
        const questionItems = document.querySelectorAll('.m-testlist li');
        totalQuestions = questionItems.length;
        
        for (let i = 0; i < totalQuestions && isRunning; i++) {
            if (isPaused) {
                await sleep(500);
                i--;
                continue;
            }
            
            processedCount = i + 1;
            updateStats();
            
            // 点击题目列表跳转到该题
            const questionItem = questionItems[i];
            const link = questionItem.querySelector('a');
            if (link) {
                link.click();
                await sleep(CONFIG.answerDelay);
            }
            
            // 采集当前题目答案
            const result = await collectCurrentQuestionAnswer(i + 1);
            if (result) {
                collectedAnswers.push(result);
                log(`第${i + 1}题 ✓ 答案: ${result.answer}`, 'success');
            } else {
                log(`第${i + 1}题 ⚠ 采集失败`, 'warning');
            }
            
            await sleep(200);
        }
        
        // 采集完成
        if (isRunning) {
            log(`采集完成！共采集 ${collectedAnswers.length} 道题`, 'success');
        }
        
        stopCollecting();
    }
    
    async function collectCurrentQuestionAnswer(questionNum) {
        try {
            // 获取题目内容
            const questionTitle = document.querySelector('.m-questiontitle');
            let questionText = '';
            if (questionTitle) {
                questionText = questionTitle.textContent.replace(/第\d+题/, '').trim();
            }
            
            // 获取选项
            const options = [];
            const optionElements = document.querySelectorAll('.m-question dd');
            for (const opt of optionElements) {
                const text = opt.textContent.trim();
                if (text) options.push(text);
            }
            
            // 判断题型
            const isMultiple = document.querySelector('.m-question dd input[type="checkbox"]') !== null;
            const questionType = isMultiple ? '多选题' : '单选题';
            
            // 点击查看答案
            const viewAnswerBtn = Array.from(document.querySelectorAll('dt span, dt div')).find(el => 
                el.textContent.includes('查看答案')
            );
            
            if (!viewAnswerBtn) {
                return null;
            }
            
            viewAnswerBtn.click();
            await sleep(400);
            
            // 获取答案
            const answer = await getAnswerFromIframe();
            
            // 关闭弹窗
            closeAnswerDialog();
            await sleep(100);
            
            if (!answer) return null;
            
            return {
                questionNum,
                questionType,
                questionText,
                options,
                answer
            };
        } catch (e) {
            console.error('采集出错:', e);
            return null;
        }
    }
    
    function stopCollecting() {
        isRunning = false;
        isPaused = false;
        isCollectMode = false;
        
        const panel = document.getElementById('auto-answer-panel');
        panel.classList.remove('running');
        
        document.getElementById('startBtn').style.display = 'block';
        document.getElementById('collectBtn').style.display = 'block';
        document.getElementById('pauseBtn').style.display = 'none';
        
        updateStatus('idle');
        log(`采集已停止，共 ${collectedAnswers.length} 题`, 'info');
    }
    
    // ==================== 导出功能 ====================
    function exportToJSON() {
        if (collectedAnswers.length === 0) {
            log('没有可导出的数据', 'warning');
            alert('没有采集到答案，请先点击"采集答案"！');
            return;
        }
        
        const exportData = {
            exportTime: new Date().toLocaleString(),
            totalQuestions: collectedAnswers.length,
            answers: collectedAnswers
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `奥派答案_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        log(`已导出 ${collectedAnswers.length} 道题答案`, 'success');
    }
    
    function copyToClipboard() {
        if (collectedAnswers.length === 0) {
            log('没有可复制的数据', 'warning');
            alert('没有采集到答案，请先点击"采集答案"！');
            return;
        }
        
        let text = '========== 奥派直播电商答案汇总 ==========\n';
        text += `采集时间: ${new Date().toLocaleString()}\n`;
        text += `题目总数: ${collectedAnswers.length}\n`;
        text += '==========================================\n\n';
        
        for (const item of collectedAnswers) {
            text += `【第${item.questionNum}题】(${item.questionType})\n`;
            text += `题目: ${item.questionText}\n`;
            if (item.options && item.options.length > 0) {
                text += `选项:\n`;
                item.options.forEach(opt => {
                    text += `  ${opt}\n`;
                });
            }
            text += `✅ 正确答案: ${item.answer}\n`;
            text += '-------------------------------------------\n\n';
        }
        
        navigator.clipboard.writeText(text).then(() => {
            log(`已复制 ${collectedAnswers.length} 道题答案`, 'success');
            alert(`已复制 ${collectedAnswers.length} 道题的答案到剪贴板！`);
        }).catch(() => {
            // 备用方案
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            log(`已复制 ${collectedAnswers.length} 道题答案`, 'success');
            alert(`已复制 ${collectedAnswers.length} 道题的答案到剪贴板！`);
        });
    }

    // ==================== 工具函数 ====================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== 初始化 ====================
    function init() {
        // 等待页面加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createPanel);
        } else {
            createPanel();
        }
        
        console.log('🤖 奥派直播电商运营实训 - 自动答题助手 v1.0.0');
        console.log('📧 作者: 传康kk (微信:1837620622)');
    }

    init();
})();
