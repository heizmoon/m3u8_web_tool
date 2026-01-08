/**
 * 视频核心逻辑：负责 FFmpeg 运算和文件处理
 */
let ffmpeg = null;

async function initCore() {
    const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
    ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', ({ message }) => {
        UI.writeLog(`[内核] ${message}`);
        if (message.includes('frame=')) {
            // 解析日志并调用 UI 更新
            const time = message.match(/time=\s*([\d:.]+)/)?.[1] || '-';
            UI.updateStats(time, '计算中...', '加速中');
        }
    });

    // 调用带进度的加载
    await loadWasmComponents();
    
    const btn = document.getElementById('runBtn');
    btn.disabled = false;
    btn.innerText = "选择文件夹并开始";
    UI.setStep(2);
}

async function loadWasmComponents() {
    const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', 'WASM 内核', 32000000);
    // ... 加载 core.js 和 worker.js
    await ffmpeg.load({ coreURL: './ffmpeg-core.js', wasmURL, workerURL: './ffmpeg-core.worker.js' });
    UI.updateProgress("✅ 引擎就绪", 100);
}

async function fetchWithProgress(url, name, size) {
    // 这里的逻辑只负责下载，下载完后通知 UI
    // ... fetch 代码 ...
    UI.updateProgress(`下载 ${name}`, currentPct);
    return blobURL;
}

// 绑定核心业务逻辑到按钮
document.getElementById('runBtn').onclick = async () => {
    UI.setStep(3);
    // ... 执行分段合并逻辑 ...
    UI.writeLog("🎉 分段导出完成！");
};

document.getElementById('mergeMp4Btn').onclick = async () => {
    // ... 执行本地拼合逻辑 ...
};

// 启动
initCore();