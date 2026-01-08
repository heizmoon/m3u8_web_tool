/**
 * ui-controller.js
 * 职责：界面更新、日志展示、下载触发
 */
const UI = {
    // 更新主进度条
    updateProgress(name, pct) {
        const nameEl = document.getElementById('task-name');
        const pctEl = document.getElementById('task-pct');
        const barEl = document.getElementById('task-bar');
        if(nameEl) nameEl.innerText = name;
        if(pctEl) pctEl.innerText = pct + '%';
        if(barEl) barEl.style.width = pct + '%';
    },

    // 从 FFmpeg 日志解析数据并更新统计栏
    updateStatsFromLog(message) {
        const time = message.match(/time=\s*([\d:.]+)/)?.[1] || '-';
        const sizeKB = message.match(/size=\s*(\d+)kB/)?.[1] || '0';
        let speed = message.match(/speed=\s*([\d.e+x\s]+)/)?.[1] || '-';
        if (speed.includes('e+')) speed = Math.round(parseFloat(speed)) + 'x';

        document.getElementById('stat-time').innerText = time;
        document.getElementById('stat-size').innerText = (parseInt(sizeKB) / 1024).toFixed(1) + ' MB';
        document.getElementById('stat-speed').innerText = speed;
    },

    // 切换侧边栏步骤状态
    setStep(stepNumber) {
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`step-${stepNumber}`);
        if(target) target.classList.add('active');
    },

    // 输出系统日志
    writeLog(msg) {
        const logEl = document.getElementById('log');
        if(logEl) {
            logEl.innerText += `\n> ${msg}`;
            logEl.scrollTop = logEl.scrollHeight;
        }
    },

    // 触发浏览器下载
    downloadFile(data, fileName) {
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        // 延迟释放，防止下载被浏览器安全机制中断
        setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 20000);
    }
};

// 标签页切换逻辑 (美术表现相关)
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = (e) => {
        const tabId = e.target.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    };
});