/**
 * UI 控制器
 */
const I18N_DATA = {
    'zh-CN': {
        step_title: "步骤说明：",
        step_1: "等待内核加载",
        step_2: "选择源文件夹",
        step_3: "等待自动下载",
        warn_title: "⚠️ 防拦截提示",
        warn_text: "若浏览器弹出“允许下载多个文件”，请务必点击允许。",
        tab_m3u8: "M3U8 自动化合并",
        tab_mp4: "本地分段拼合",
        engine_preparing: "引擎准备中...",
        stat_time: "时长",
        stat_size: "体积",
        stat_speed: "速度",
        btn_init: "初始化中...",
        btn_select: "选择文件夹并开始",
        btn_processing: "处理中...",
        hint_smart: "智能体积感应：超大视频自动分段，小体积视频无损合一",
        btn_merge_mp4: "🧩 选中本地 MP4 文件并拼合",
        log_title: "系统日志输出",
        ad_label: "广告",
        ad1_title: "🚀 极速 VPN",
        ad1_text: "海外视频流畅看，不卡顿！",
        ad_btn_try: "免费试用",
        ad2_title: "🎮 云游戏平台",
        ad2_text: "无需显卡，畅玩 3A 大作",
        ad_btn_go: "立即体验",
        ad_sponsor: "赞助",
        ad_placeholder: "此处虚位以待<br>联系我们投放",
        
        // 动态内容
        info_safe_title: "🛡️ 本地安全处理",
        info_safe_p1: "1. 核心引擎 (31.2MB) 下载后<b>完全本地运行</b>，不消耗额外上传流量。",
        info_safe_p2: "2. <b>智能分段</b>：视频总计 >1.5GB 时将分段导出，防止浏览器内存溢出。",
        mp4_func_desc: "<b>🧩 功能说明：</b>用于将 Part_1, Part_2... 等手动保存的分段合并为整体。",
        mp4_warn: "⚠️ 警告：总大小超过 2GB 时建议保留分段，以免合并下载失败。"
    },
    'zh-TW': {
        step_title: "步驟說明：",
        step_1: "等待核心載入",
        step_2: "選擇來源資料夾",
        step_3: "等待自動下載",
        warn_title: "⚠️ 防攔截提示",
        warn_text: "若瀏覽器彈出「允許下載多個檔案」，請務必點擊允許。",
        tab_m3u8: "M3U8 自動化合併",
        tab_mp4: "本地分段拼合",
        engine_preparing: "引擎準備中...",
        stat_time: "時長",
        stat_size: "體積",
        stat_speed: "速度",
        btn_init: "初始化中...",
        btn_select: "選擇資料夾並開始",
        btn_processing: "處理中...",
        hint_smart: "智能體積感應：超大影片自動分段，小體積影片無損合一",
        btn_merge_mp4: "🧩 選中本地 MP4 檔案並拼合",
        log_title: "系統日誌輸出",
        ad_label: "廣告",
        ad1_title: "🚀 極速 VPN",
        ad1_text: "海外影片流暢看，不卡頓！",
        ad_btn_try: "免費試用",
        ad2_title: "🎮 雲遊戲平台",
        ad2_text: "無需顯卡，暢玩 3A 大作",
        ad_btn_go: "立即體驗",
        ad_sponsor: "贊助",
        ad_placeholder: "此處虛位以待<br>聯繫我們投放",

        info_safe_title: "🛡️ 本地安全處理",
        info_safe_p1: "1. 核心引擎 (31.2MB) 下載後<b>完全本地執行</b>，不消耗額外上傳流量。",
        info_safe_p2: "2. <b>智能分段</b>：影片總計 >1.5GB 時將分段導出，防止瀏覽器記憶體溢出。",
        mp4_func_desc: "<b>🧩 功能說明：</b>用於將 Part_1, Part_2... 等手動保存的分段合併為整體。",
        mp4_warn: "⚠️ 警告：總大小超過 2GB 時建議保留分段，以免合併下載失敗。"
    },
    'en': {
        step_title: "Instructions:",
        step_1: "Load Engine",
        step_2: "Select Folder",
        step_3: "Wait Download",
        warn_title: "⚠️ Pop-up Warning",
        warn_text: "Please ALLOW if browser asks to download multiple files.",
        tab_m3u8: "M3U8 Auto Merge",
        tab_mp4: "MP4 Local Merge",
        engine_preparing: "Preparing...",
        stat_time: "Time",
        stat_size: "Size",
        stat_speed: "Speed",
        btn_init: "Initializing...",
        btn_select: "Select Folder & Start",
        btn_processing: "Processing...",
        hint_smart: "Smart Splitting: Large files auto-split to prevent crash.",
        btn_merge_mp4: "🧩 Select & Merge MP4 Files",
        log_title: "System Log",
        ad_label: "Ad",
        ad1_title: "🚀 Fast VPN",
        ad1_text: "Watch global videos smoothly!",
        ad_btn_try: "Free Trial",
        ad2_title: "🎮 Cloud Gaming",
        ad2_text: "Play AAA games without GPU",
        ad_btn_go: "Try Now",
        ad_sponsor: "Sponsor",
        ad_placeholder: "Your Ad Here<br>Contact Us",

        info_safe_title: "🛡️ Local & Secure",
        info_safe_p1: "1. Core Engine (31.2MB) runs <b>entirely offline</b>.",
        info_safe_p2: "2. <b>Smart Split</b>: Auto-splits if total size > 1.5GB.",
        mp4_func_desc: "<b>🧩 Info:</b> Merge Part_1, Part_2... into one file.",
        mp4_warn: "⚠️ Warn: Keep parts if > 2GB to avoid browser crash."
    }
};

const UI = {
    currentLang: 'zh-CN',

    // 切换语言
    setLanguage(lang) {
        // 兜底策略：如果是不支持的语言，默认英语
        if (!I18N_DATA[lang]) {
            // 简单模糊匹配 (zh-HK -> zh-TW, else -> en)
            if (lang.startsWith('zh')) lang = lang.includes('TW') || lang.includes('HK') ? 'zh-TW' : 'zh-CN';
            else lang = 'en';
        }

        this.currentLang = lang;
        const t = I18N_DATA[lang];

        // 1. 更新所有静态文本
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.innerHTML = t[key];
        });

        // 2. 更新动态 HTML 内容
        this.initStaticContent();

        // 3. 更新下拉框状态
        const select = document.getElementById('lang-select');
        if (select) select.value = lang;
        
        // 4. 更新按钮状态文字（如果在非处理中状态）
        const runBtn = document.getElementById('runBtn');
        if (runBtn && !runBtn.disabled && runBtn.innerText.includes('Select') || runBtn.innerText.includes('选择')) {
            runBtn.innerText = t.btn_select;
        }
    },

    // 填充静态提示信息 (已升级为多语言)
    initStaticContent() {
        const infoBox = document.getElementById('info-card-box');
        const mp4Box = document.getElementById('mp4-info-box');
        const t = I18N_DATA[this.currentLang];

        if (infoBox) {
            infoBox.innerHTML = `
                <h4>${t.info_safe_title}</h4>
                <p>${t.info_safe_p1}</p>
                <p>${t.info_safe_p2}</p>
            `;
        }

        if (mp4Box) {
            mp4Box.innerHTML = `
                <p>${t.mp4_func_desc}</p>
                <p style="color: #b91c1c; font-size: 12px; margin-top:5px;">${t.mp4_warn}</p>
            `;
        }
    },

    // 更新进度条和文字 (1218 / 2299 逻辑在这里实现)
updateProgress(text, pct) {
    const nameEl = document.getElementById('task-name');
    const pctEl = document.getElementById('task-pct');
    const barEl = document.getElementById('task-bar');
    
    // 如果 text 包含 "/", 说明是正在处理片段，我们把这个关键信息放在最显眼的地方
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
    // 语言初始化
    const userLang = navigator.language || 'en';
    UI.setLanguage(userLang);

    // 绑定语言切换事件
    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            UI.setLanguage(e.target.value);
        });
    }

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