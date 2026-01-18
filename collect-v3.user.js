// ==UserScript==
// @name         奥派 - 历史试卷采集 V3（逐题点击版）
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  逐题点击采集历史试卷参考答案，确保每题正确获取
// @author       传康kk (微信:1837620622)
// @match        http://121.40.29.50/AllPassLECTM/testcenter/views/answerprogressresult.html*
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let collected = [];
    let running = false;
    let stopped = false;

    // ==================== 样式 ====================
    GM_addStyle(`
        #cpanel3 {
            position: fixed; top: 20px; right: 20px; width: 300px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 2px solid #00ff88; border-radius: 12px;
            padding: 16px; z-index: 999999; font-family: sans-serif; color: #fff;
            box-shadow: 0 0 30px rgba(0, 255, 136, 0.3);
        }
        #cpanel3 h3 { margin: 0 0 12px; color: #00ff88; text-align: center; font-size: 16px; }
        #cpanel3 .info { background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; margin-bottom: 12px; }
        #cpanel3 .info .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
        #cpanel3 .info .val { color: #00ff88; font-weight: bold; }
        #cpanel3 .btn { width: 100%; padding: 12px; margin: 6px 0; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; transition: all 0.2s; }
        #cpanel3 .btn-go { background: linear-gradient(90deg, #00ff88, #00cc6a); color: #000; }
        #cpanel3 .btn-go:hover { transform: scale(1.02); box-shadow: 0 0 15px rgba(0,255,136,0.5); }
        #cpanel3 .btn-stop { background: linear-gradient(90deg, #ff4444, #cc0000); color: #fff; }
        #cpanel3 .btn-save { background: linear-gradient(90deg, #00aaff, #0066cc); color: #fff; }
        #cpanel3 .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        #cpanel3 .log { background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; max-height: 180px; overflow-y: auto; font-size: 11px; font-family: monospace; }
        #cpanel3 .log div { padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
        #cpanel3 .log .ok { color: #00ff88; }
        #cpanel3 .log .err { color: #ff4444; }
        #cpanel3 .log .warn { color: #ffaa00; }
        #cpanel3 .progress { height: 6px; background: rgba(0,0,0,0.4); border-radius: 3px; margin: 10px 0; overflow: hidden; }
        #cpanel3 .progress-bar { height: 100%; background: linear-gradient(90deg, #00ff88, #00aaff); transition: width 0.3s; }
    `);

    // ==================== 创建面板 ====================
    function createUI() {
        const div = document.createElement('div');
        div.id = 'cpanel3';
        div.innerHTML = `
            <h3>📋 历史试卷采集 V3</h3>
            <div class="info">
                <div class="row"><span>状态:</span><span class="val" id="cstatus">待采集</span></div>
                <div class="row"><span>进度:</span><span class="val" id="cprogress">0 / 0</span></div>
                <div class="row"><span>成功:</span><span class="val" id="csuccess">0</span></div>
            </div>
            <div class="progress"><div class="progress-bar" id="cbar" style="width:0%"></div></div>
            <button class="btn btn-go" id="goBtn">🚀 开始采集</button>
            <button class="btn btn-stop" id="stopBtn" style="display:none">⏹ 停止</button>
            <button class="btn btn-save" id="saveBtn">💾 导出JSON</button>
            <div class="log" id="clog"><div>点击"开始采集"按钮...</div></div>
        `;
        document.body.appendChild(div);
        
        document.getElementById('goBtn').onclick = startCollect;
        document.getElementById('stopBtn').onclick = () => { stopped = true; };
        document.getElementById('saveBtn').onclick = saveJSON;
    }

    // ==================== 日志 ====================
    function log(msg, type) {
        const el = document.getElementById('clog');
        const d = document.createElement('div');
        d.className = type || '';
        d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        el.insertBefore(d, el.firstChild);
        console.log(msg);
    }

    // ==================== 等待函数 ====================
    function sleep(ms) { 
        return new Promise(r => setTimeout(r, ms)); 
    }

    // ==================== 等待题目加载 ====================
    async function waitForQuestion(targetNum, maxWait = 3000) {
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const titleEl = document.querySelector('.m-questiontitle');
            if (titleEl && titleEl.textContent.includes(`第${targetNum}题`)) {
                return true;
            }
            await sleep(100);
        }
        return false;
    }

    // ==================== 开始采集 ====================
    async function startCollect() {
        if (running) return;
        running = true;
        stopped = false;
        collected = [];

        document.getElementById('goBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'block';
        document.getElementById('cstatus').textContent = '采集中...';

        const items = document.querySelectorAll('.m-testlist li');
        const total = items.length;

        log(`开始采集 ${total} 道题...`, 'ok');

        for (let i = 0; i < total && !stopped; i++) {
            const targetNum = i + 1;
            
            // 点击题号
            const link = items[i].querySelector('a');
            if (link) {
                link.click();
            }

            // 等待题目加载
            const loaded = await waitForQuestion(targetNum);
            if (!loaded) {
                log(`第${targetNum}题 加载超时`, 'warn');
            }
            
            // 额外等待确保DOM完全更新
            await sleep(200);

            // 采集当前题目
            const result = grabCurrentQuestion(targetNum);
            if (result) {
                collected.push(result);
                log(`第${targetNum}题: ${result.answer}`, 'ok');
                document.getElementById('csuccess').textContent = collected.length;
            } else {
                log(`第${targetNum}题: 采集失败`, 'err');
            }

            // 更新进度
            document.getElementById('cprogress').textContent = `${i + 1} / ${total}`;
            document.getElementById('cbar').style.width = `${((i + 1) / total) * 100}%`;
        }

        running = false;
        document.getElementById('goBtn').style.display = 'block';
        document.getElementById('stopBtn').style.display = 'none';
        document.getElementById('cstatus').textContent = stopped ? '已停止' : '采集完成';
        
        log(`✅ 采集完成！共 ${collected.length} 题`, 'ok');
    }

    // ==================== 采集单题 ====================
    function grabCurrentQuestion(num) {
        try {
            // 获取选项
            const opts = [];
            document.querySelectorAll('[role="definition"], dd').forEach(el => {
                const txt = el.textContent.trim();
                if (txt && /^[A-Z][.、]/.test(txt)) {
                    opts.push(txt);
                }
            });

            // 获取参考答案
            const answerEls = Array.from(document.querySelectorAll('[role="term"], dt')).filter(el => 
                el.textContent.includes('参考答案')
            );

            if (answerEls.length === 0) return null;

            // 情景分析题（多个小题）
            if (answerEls.length > 1) {
                const subAns = [];
                answerEls.forEach((el, idx) => {
                    const m = el.textContent.match(/参考答案[：:]\s*([A-Z]+)/i);
                    if (m) subAns.push(`${idx + 1}:${m[1]}`);
                });
                return {
                    questionNum: num,
                    questionType: '情景分析题',
                    options: opts.slice(0, 4),
                    answer: subAns.join(', ')
                };
            }

            // 单选/多选题
            const ansText = answerEls[0].textContent;
            const match = ansText.match(/参考答案[：:]\s*([A-Z]+)/i);
            if (!match) return null;

            const isMulti = document.querySelector('[role="definition"] input[type="checkbox"], dd input[type="checkbox"]') !== null;

            return {
                questionNum: num,
                questionType: isMulti ? '多选题' : '单选题',
                options: opts,
                answer: match[1]
            };
        } catch (e) {
            console.error('采集错误:', e);
            return null;
        }
    }

    // ==================== 导出JSON ====================
    function saveJSON() {
        if (collected.length === 0) {
            alert('没有数据，请先采集！');
            return;
        }

        const data = {
            exportTime: new Date().toLocaleString(),
            totalQuestions: collected.length,
            answers: collected
        };

        // 处理特殊字符
        const jsonStr = JSON.stringify(data, null, 2)
            .replace(/[\u201c\u201d]/g, '"')  // 替换中文引号
            .replace(/[\u2018\u2019]/g, "'"); // 替换中文单引号

        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `历史试卷答案_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        log(`已导出 ${collected.length} 题`, 'ok');
    }

    // ==================== 初始化 ====================
    createUI();
    console.log('📋 历史试卷采集 V3 已加载');
})();
