const UI = {
    initStaticContent() {
        const infoCard = document.querySelector('.info-card');
        infoCard.innerHTML = `
            <h4>🛡️ 安全与流量说明</h4>
            <p>1. 首次需下载约 <b>31MB</b> 核心引擎，加载后<b>完全本地运行</b>，不消耗上传流量。</p>
            <p>2. 系统将根据视频大小智能分段（单段约1GB），以防止浏览器崩溃。</p>
        `;

        const mp4Tab = document.getElementById('mp4-tab');
        const alertDiv = mp4Tab.querySelector('.info-alert');
        alertDiv.innerHTML = `
            <p><b>🧩 功能说明：</b>用于将 Part_1, Part_2... 合并为一个完整 MP4。</p>
            <p style="color: #b91c1c; font-size: 12px;">⚠️ 注意：总计超过 2GB 时建议保留分段，以免合并失败。</p>
        `;
    },

    // 进度条增强：支持主文字和百分比
    updateProgress(name, pct) {
        document.getElementById('task-name').innerText = name;
        document.getElementById('task-pct').innerText = pct + '%';
        document.getElementById('task-bar').style.width = pct + '%';
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

// --- 修复 Tab 点击逻辑 ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = (e) => {
        const tabId = e.currentTarget.getAttribute('data-tab'); // 使用 currentTarget
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        
        e.currentTarget.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    };
});

UI.initStaticContent();