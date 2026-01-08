const UI = {
    initStaticContent() {
        const infoCard = document.querySelector('.info-card');
        infoCard.innerHTML = `
            <h4>🛡️ 本地安全处理</h4>
            <p>1. 核心引擎 (31MB) 加载后<b>完全本地运行</b>，不消耗额外流量。</p>
            <p>2. 系统采用<b>容量自适应算法</b>：小于 1.5GB 的视频将合并为单文件，超大视频自动分段以保安全。</p>
        `;
        const mp4Tab = document.getElementById('mp4-tab');
        mp4Tab.querySelector('.info-alert').innerHTML = `
            <p><b>🧩 功能说明：</b>用于将 Part_1, Part_2... 碎片无损合并为整体。</p>
            <p style="color: #b91c1c; font-size: 12px;">⚠️ 注意：如果总文件超过 2GB，浏览器下载可能会因内存限制而失败。</p>
        `;
    },

    // 更新进度条文字与长度
    updateProgress(text, pct) {
        document.getElementById('task-name').innerText = text;
        document.getElementById('task-pct').innerText = pct + '%';
        document.getElementById('task-bar').style.width = pct + '%';
    },

    // 核心修复：解析 FFmpeg 输出，更新统计面板
    updateStatsFromLog(message) {
        const timeMatch = message.match(/time=\s*([\d:.]+)/);
        const sizeMatch = message.match(/size=\s*(\d+)kB/);
        const speedMatch = message.match(/speed=\s*([\d.e+x\s]+)/);

        if (timeMatch) document.getElementById('stat-time').innerText = timeMatch[1];
        if (sizeMatch) document.getElementById('stat-size').innerText = (parseInt(sizeMatch[1]) / 1024).toFixed(1) + ' MB';
        if (speedMatch) {
            let s = speedMatch[1].trim();
            if (s.includes('e+')) s = "高速";
            document.getElementById('stat-speed').innerText = s;
        }
    },

    setStep(stepNumber) {
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`step-${stepNumber}`);
        if(target) target.classList.add('active');
    },

    writeLog(msg) {
        const logEl = document.getElementById('log');
        logEl.innerText += `\n> ${msg}`;
        logEl.scrollTop = logEl.scrollHeight;
    },

    downloadFile(data, fileName) {
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 20000);
    }
};

// 确保 Tab 切换可用
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const tabId = e.currentTarget.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    });
});

UI.initStaticContent();