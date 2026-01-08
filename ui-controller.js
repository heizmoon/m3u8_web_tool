const UI = {
    // 初始化 UI 描述
    initStaticContent() {
        // 在左侧侧边栏增加安全与体积说明
        const infoCard = document.querySelector('.info-card');
        infoCard.innerHTML = `
            <h4>🛡️ 安全与流量说明</h4>
            <p>1. 首次需下载约 <b>31MB</b> 核心引擎，加载后<b>完全本地运行</b>，不消耗上传流量，保护视频隐私。</p>
            <p>2. 片段过多时将自动<b>分段导出</b>，以防止浏览器内存溢出导致崩溃。</p>
        `;

        // 增强 MP4 拼合页的描述
        const mp4Tab = document.getElementById('mp4-tab');
        const alertDiv = mp4Tab.querySelector('.info-alert');
        alertDiv.innerHTML = `
            <p><b>🧩 功能说明：</b>此工具用于将之前自动导出的 Part_1, Part_2... 碎片合并为一个完整的 MP4。</p>
            <p style="color: #b91c1c; font-size: 12px; margin-top: 5px;">⚠️ 警告：如果合并后的总文件超过 2GB，浏览器可能会因为 32 位寻址限制而失败，此时建议保留分段文件使用播放器播放。</p>
        `;
    },

    updateProgress(name, pct) {
        document.getElementById('task-name').innerText = name;
        document.getElementById('task-pct').innerText = pct + '%';
        document.getElementById('task-bar').style.width = pct + '%';
    },

    updateStatsFromLog(message) {
        const time = message.match(/time=\s*([\d:.]+)/)?.[1] || '-';
        const sizeKB = message.match(/size=\s*(\d+)kB/)?.[1] || '0';
        document.getElementById('stat-time').innerText = time;
        document.getElementById('stat-size').innerText = (parseInt(sizeKB) / 1024).toFixed(1) + ' MB';
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

UI.initStaticContent();

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = (e) => {
        const tabId = e.target.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    };
});