/**
 * UI 控制器
 */
const UI = {
    // 填充静态提示信息
    initStaticContent() {
        const infoBox = document.getElementById('info-card-box');
        const mp4Box = document.getElementById('mp4-info-box');

        if (infoBox) {
            infoBox.innerHTML = `
                <h4>🛡️ 本地安全处理</h4>
                <p>1. 核心引擎 (31.2MB) 下载后<b>完全本地运行</b>，不消耗额外上传流量。</p>
                <p>2. <b>智能分段</b>：视频总计 >1.5GB 时将分段导出，防止浏览器内存溢出。</p>
            `;
        }

        if (mp4Box) {
            mp4Box.innerHTML = `
                <p><b>🧩 功能说明：</b>用于将 Part_1, Part_2... 等手动保存的分段合并为整体。</p>
                <p style="color: #b91c1c; font-size: 12px; margin-top:5px;">⚠️ 警告：总大小超过 2GB 时建议保留分段，以免合并下载失败。</p>
            `;
        }
    },

    // 更新进度条和文字 (1218 / 2299 逻辑在这里实现)
    updateProgress(text, pct) {
        const nameEl = document.getElementById('task-name');
        const pctEl = document.getElementById('task-pct');
        const barEl = document.getElementById('task-bar');
        
        if (nameEl) nameEl.innerText = text;
        if (pctEl) pctEl.innerText = pct + '%';
        if (barEl) barEl.style.width = pct + '%';
    },

    // 从 FFmpeg 日志实时提取时长、体积、速度
    updateStatsFromLog(message) {
        const timeMatch = message.match(/time=\s*([\d:.]+)/);
        const sizeMatch = message.match(/size=\s*(\d+)kB/);
        const speedMatch = message.match(/speed=\s*([\d.e+x\s]+)/);

        if (timeMatch) document.getElementById('stat-time').innerText = timeMatch[1];
        if (sizeMatch) {
            const mb = (parseInt(sizeMatch[1]) / 1024).toFixed(1);
            document.getElementById('stat-size').innerText = mb + ' MB';
        }
        if (speedMatch) {
            let s = speedMatch[1].trim();
            document.getElementById('stat-speed').innerText = s.includes('e+') ? "高速" : s;
        }
    },

    // 系统日志
    writeLog(msg) {
        const logEl = document.getElementById('log');
        if (logEl) {
            logEl.innerText += `\n> ${msg}`;
            logEl.scrollTop = logEl.scrollHeight;
        }
    },

    // 设置左侧步骤状态
    setStep(stepNumber) {
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`step-${stepNumber}`);
        if (target) target.classList.add('active');
    },

    // 触发下载
    downloadFile(data, fileName) {
        UI.writeLog(`💾 正在导出文件: ${fileName}`);
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    UI.initStaticContent();
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = e.currentTarget.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const targetPanel = document.getElementById(tabId);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });
});