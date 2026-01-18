// ==UserScript==
// @name         奥派直播电商 - 题库自动答题
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  加载本地JSON题库，自动匹配选项并答题
// @author       传康kk (微信:1837620622)
// @match        http://121.40.29.50/AllPassLECTM/testcenter/views/tprogress.html*
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 全局变量 ====================
    let questionBank = new Map();  // 题库：选项 -> 答案
    let isRunning = false;
    let isPaused = false;
    let delay = 500;  // 答题延迟(毫秒)

    // ==================== 样式 ====================
    GM_addStyle(`
        #exam-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 280px;
            background: rgba(10, 14, 39, 0.95);
            border: 1px solid #00ffff;
            border-radius: 10px;
            padding: 15px;
            z-index: 999999;
            font-family: 'Microsoft YaHei', sans-serif;
            color: #fff;
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
        }
        #exam-panel h3 {
            margin: 0 0 15px 0;
            color: #00ffff;
            font-size: 16px;
            text-align: center;
            border-bottom: 1px solid rgba(0, 255, 255, 0.3);
            padding-bottom: 10px;
        }
        #exam-panel .btn {
            display: block;
            width: 100%;
            padding: 10px;
            margin: 8px 0;
            border: 1px solid;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        #exam-panel .btn-load {
            background: rgba(255, 165, 0, 0.2);
            border-color: #ffa500;
            color: #ffa500;
        }
        #exam-panel .btn-load:hover {
            background: rgba(255, 165, 0, 0.4);
        }
        #exam-panel .btn-start {
            background: rgba(0, 255, 0, 0.2);
            border-color: #00ff00;
            color: #00ff00;
        }
        #exam-panel .btn-start:hover {
            background: rgba(0, 255, 0, 0.4);
        }
        #exam-panel .btn-stop {
            background: rgba(255, 0, 0, 0.2);
            border-color: #ff0000;
            color: #ff0000;
        }
        #exam-panel .btn-stop:hover {
            background: rgba(255, 0, 0, 0.4);
        }
        #exam-panel .status {
            margin: 10px 0;
            padding: 8px;
            background: rgba(0, 0, 0, 0.5);
            border-radius: 5px;
            font-size: 12px;
        }
        #exam-panel .status span {
            color: #00ffff;
        }
        #exam-panel .log {
            max-height: 120px;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.5);
            border-radius: 5px;
            padding: 8px;
            font-size: 11px;
            margin-top: 10px;
        }
        #exam-panel .log-item {
            padding: 2px 0;
            color: #aaa;
        }
        #exam-panel .log-item.success { color: #00ff00; }
        #exam-panel .log-item.error { color: #ff0000; }
        #exam-panel .log-item.warn { color: #ffaa00; }
        #exam-panel input[type="file"] { display: none; }
        #exam-panel .speed-control {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 10px 0;
        }
        #exam-panel .speed-control label {
            font-size: 12px;
            color: #888;
        }
        #exam-panel .speed-control input {
            flex: 1;
            background: rgba(0, 255, 255, 0.2);
            border: 1px solid #00ffff;
            border-radius: 3px;
            color: #00ffff;
            padding: 5px;
            text-align: center;
        }
    `);

    // ==================== 创建面板 ====================
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'exam-panel';
        panel.innerHTML = `
            <h3>📚 题库自动答题</h3>
            <div class="status">
                题库状态: <span id="bankStatus">未加载</span><br>
                答题进度: <span id="progress">0/0</span>
            </div>
            <input type="file" id="fileInput" accept=".json">
            <button class="btn btn-load" id="loadBtn">📁 加载题库JSON</button>
            <div class="speed-control">
                <label>延迟(ms):</label>
                <input type="number" id="delayInput" value="500" min="100" max="3000" step="100">
            </div>
            <button class="btn btn-start" id="startBtn" disabled>▶ 开始答题</button>
            <button class="btn btn-stop" id="stopBtn" style="display:none;">⏹ 停止</button>
            <div class="log" id="logArea">
                <div class="log-item">等待加载题库...</div>
            </div>
        `;
        document.body.appendChild(panel);

        // 绑定事件
        document.getElementById('loadBtn').onclick = () => document.getElementById('fileInput').click();
        document.getElementById('fileInput').onchange = handleFileLoad;
        document.getElementById('startBtn').onclick = startAutoAnswer;
        document.getElementById('stopBtn').onclick = stopAutoAnswer;
        document.getElementById('delayInput').onchange = (e) => { delay = parseInt(e.target.value) || 500; };
    }

    // ==================== 加载题库文件 ====================
    function handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const data = JSON.parse(event.target.result);
                if (!data.answers || !Array.isArray(data.answers)) {
                    throw new Error('JSON格式错误，缺少answers数组');
                }

                // 清空旧题库
                questionBank.clear();

                // 构建题库Map：使用选项内容作为key
                data.answers.forEach(item => {
                    if (item.options && item.answer) {
                        // 标准化选项并排序作为key
                        const key = normalizeOptions(item.options);
                        questionBank.set(key, item.answer);
                    }
                });

                log(`✅ 题库加载成功！共 ${questionBank.size} 道题`, 'success');
                document.getElementById('bankStatus').textContent = `已加载 ${questionBank.size} 题`;
                document.getElementById('startBtn').disabled = false;

            } catch (err) {
                log(`❌ 加载失败: ${err.message}`, 'error');
            }
        };
        reader.readAsText(file);
    }

    // ==================== 标准化选项 ====================
    function normalizeOptions(options) {
        // 去除选项字母前缀，标准化文本，排序后拼接
        return options
            .map(opt => opt.replace(/^[A-Za-z][.、\s]?\s*/, '').trim().toLowerCase())
            .sort()
            .join('|');
    }

    // ==================== 匹配答案 ====================
    function findAnswer(pageOptions) {
        const key = normalizeOptions(pageOptions);
        
        // 精确匹配
        if (questionBank.has(key)) {
            return questionBank.get(key);
        }

        // 模糊匹配：遍历题库
        for (const [bankKey, answer] of questionBank.entries()) {
            const bankParts = bankKey.split('|');
            const pageParts = key.split('|');
            
            if (bankParts.length !== pageParts.length) continue;
            
            // 检查每个选项是否包含关系
            let matchCount = 0;
            for (const pagePart of pageParts) {
                for (const bankPart of bankParts) {
                    if (pagePart.includes(bankPart) || bankPart.includes(pagePart)) {
                        matchCount++;
                        break;
                    }
                }
            }
            
            if (matchCount === pageParts.length) {
                return answer;
            }
        }

        return null;
    }

    // ==================== 开始自动答题 ====================
    async function startAutoAnswer() {
        if (isRunning) return;
        if (questionBank.size === 0) {
            log('❌ 请先加载题库！', 'error');
            return;
        }

        isRunning = true;
        isPaused = false;
        
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'block';
        
        log('🚀 开始自动答题...', 'success');

        // 获取所有题目
        const questionItems = document.querySelectorAll('.m-testlist li');
        const total = questionItems.length;
        let completed = 0;
        let matched = 0;

        for (let i = 0; i < total && isRunning; i++) {
            // 点击题目跳转
            const link = questionItems[i].querySelector('a');
            if (link) {
                link.click();
                await sleep(delay);
            }

            // 处理当前题目
            const result = await processCurrentQuestion(i + 1);
            completed++;
            if (result) matched++;

            document.getElementById('progress').textContent = `${completed}/${total} (匹配${matched})`;
            await sleep(200);
        }

        if (isRunning) {
            log(`✅ 答题完成！匹配 ${matched}/${total} 题`, 'success');
        }
        
        stopAutoAnswer();
    }

    // ==================== 处理单个题目（支持单选、多选、情景分析题） ====================
    async function processCurrentQuestion(num) {
        try {
            // 检测是否为情景分析题（多个小题）
            const subQuestions = document.querySelectorAll('.m-question dl, .m-content dl');
            
            if (subQuestions.length > 1) {
                // 情景分析题：处理多个小题
                return await processScenarioQuestion(num, subQuestions);
            }

            // 单选/多选题 - 使用正确的选择器
            const optionElements = document.querySelectorAll('.m-question dd, [role="definition"]');
            const options = [];
            const optionMap = {};

            optionElements.forEach(el => {
                const text = el.textContent.trim();
                if (text && /^[A-Z][.、]/.test(text)) {
                    options.push(text);
                    const match = text.match(/^([A-Za-z])[.、\s]/);
                    if (match) {
                        const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
                        if (input) {
                            optionMap[match[1].toUpperCase()] = input;
                        }
                    }
                }
            });

            if (options.length === 0) {
                log(`第${num}题 获取选项失败`, 'warn');
                return false;
            }

            const answer = findAnswer(options);

            if (!answer) {
                log(`第${num}题 未匹配，跳过`, 'warn');
                await clickSkip();
                return false;
            }

            log(`第${num}题 答案: ${answer}`, 'success');

            const answerLetters = answer.split('').filter(c => /[A-Z]/i.test(c));
            for (const letter of answerLetters) {
                const input = optionMap[letter.toUpperCase()];
                if (input && !input.checked) {
                    input.click();
                    await sleep(100);
                }
            }

            await sleep(300);
            await clickNext();
            return true;

        } catch (err) {
            log(`第${num}题 错误: ${err.message}`, 'error');
            return false;
        }
    }

    // ==================== 处理情景分析题 ====================
    async function processScenarioQuestion(num, subQuestions) {
        log(`第${num}题 情景分析题`, 'success');
        
        // 获取页面上所有小题的选项容器
        const subContainers = document.querySelectorAll('.m-question > div > div, [role="generic"]');
        let matchedCount = 0;
        let subIdx = 0;
        
        for (const container of subContainers) {
            // 检查是否包含选项
            const optionEls = container.querySelectorAll('dd, [role="definition"]');
            const options = [];
            const optionMap = {};

            optionEls.forEach(el => {
                const text = el.textContent.trim();
                if (text && /^[A-Z][.、]/.test(text)) {
                    options.push(text);
                    const match = text.match(/^([A-Za-z])[.、\s]/);
                    if (match) {
                        const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
                        if (input) {
                            optionMap[match[1].toUpperCase()] = input;
                        }
                    }
                }
            });

            if (options.length === 0) continue;
            subIdx++;

            // 匹配答案
            const answer = findAnswer(options);
            if (answer) {
                const answerLetters = answer.split('').filter(c => /[A-Z]/i.test(c));
                for (const letter of answerLetters) {
                    const input = optionMap[letter.toUpperCase()];
                    if (input && !input.checked) {
                        input.click();
                        await sleep(80);
                    }
                }
                matchedCount++;
                log(`  ${num}-${subIdx}: ${answer}`, 'success');
            }
            
            await sleep(100);
        }

        await sleep(300);
        await clickNext();
        return matchedCount > 0;
    }

    // ==================== 点击下一题 ====================
    async function clickNext() {
        const nextBtn = document.querySelector('.m-btns a.btn-primary') ||
                       Array.from(document.querySelectorAll('.m-btns a, .m-btns span')).find(el => 
                           el.textContent.includes('确定并下一题') || el.textContent.includes('下一题')
                       );
        if (nextBtn) {
            nextBtn.click();
            await sleep(delay);
        }
    }

    // ==================== 点击跳过 ====================
    async function clickSkip() {
        const skipBtn = Array.from(document.querySelectorAll('.m-btns a, .m-btns span')).find(el => 
            el.textContent.trim() === '跳过'
        );
        if (skipBtn) {
            skipBtn.click();
            await sleep(delay);
        } else {
            await clickNext();
        }
    }

    // ==================== 停止答题 ====================
    function stopAutoAnswer() {
        isRunning = false;
        document.getElementById('startBtn').style.display = 'block';
        document.getElementById('stopBtn').style.display = 'none';
        log('⏹ 已停止', 'warn');
    }

    // ==================== 工具函数 ====================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function log(msg, type = '') {
        const logArea = document.getElementById('logArea');
        const item = document.createElement('div');
        item.className = 'log-item ' + type;
        item.textContent = msg;
        logArea.insertBefore(item, logArea.firstChild);
        
        // 保留最近30条
        while (logArea.children.length > 30) {
            logArea.removeChild(logArea.lastChild);
        }
        
        console.log(msg);
    }

    // ==================== 初始化 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel);
    } else {
        createPanel();
    }

    console.log('📚 奥派直播电商 - 题库自动答题 v2.0.0');
})();
