let ffmpeg = null;

// 初始化系统
async function init() {
    try {
        const script = document.createElement('script');
        script.src = './ffmpeg.js';
        document.head.appendChild(script);
        await new Promise(r => script.onload = r);

        const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
        ffmpeg = new FFmpeg();

        ffmpeg.on('log', ({ message }) => {
            if (message.includes('frame=')) updateUIStats(message);
            writeLog(`[内核] ${message}`);
        });

        // 加载 WASM (带进度修正)
        const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', 'WASM 核心', 32000000);
        await ffmpeg.load({ coreURL: './ffmpeg-core.js', wasmURL, workerURL: './ffmpeg-core.worker.js' });

        document.getElementById('runBtn').disabled = false;
        document.getElementById('runBtn').innerText = "选择文件夹并开始合并";
        document.getElementById('step-1').classList.remove('active');
        document.getElementById('step-2').classList.add('active');
    } catch (e) { writeLog("引擎启动失败: " + e.message); }
}

// 递归搜索目录中的 M3U8 文件
async function findM3u8InDir(dirHandle, path = "") {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.m3u8')) {
            return { handle: entry, parent: dirHandle, path: path };
        }
        if (entry.kind === 'directory') {
            const found = await findM3u8InDir(entry, path + entry.name + "/");
            if (found) return found;
        }
    }
    return null;
}

// 主处理逻辑
async function startM3u8Process() {
    try {
        const dirHandle = await window.showDirectoryPicker();
        writeLog(`已识别目录: ${dirHandle.name}`);

        const m3u8Info = await findM3u8InDir(dirHandle);
        if (!m3u8Info) throw new Error("所选目录中未找到 .m3u8 文件");
        
        writeLog(`发现清单: ${m3u8Info.path}${m3u8Info.handle.name}`);

        // 此处接续你之前的分段合并逻辑...
        // 记得在开始处理时设置：
        document.getElementById('step-2').classList.remove('active');
        document.getElementById('step-3').classList.add('active');
        
        // 逻辑完成后重置按钮文字
        // btn.innerText = "选择文件夹并合并";
    } catch (e) { writeLog("错误: " + e.message); }
}

// UI 切换与更新函数
function switchTab(id) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    event.target.classList.add('active');
}

function writeLog(m) {
    const el = document.getElementById('log');
    el.innerText += `\n> ${m}`;
    el.scrollTop = el.scrollHeight;
}

// 启动初始化
init();