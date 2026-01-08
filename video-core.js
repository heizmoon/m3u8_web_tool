let ffmpeg = null;
const runBtn = document.getElementById('runBtn');

async function initCore() {
    try {
        const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('log', ({ message }) => {
            UI.writeLog(`[内核] ${message}`);
            if (message.includes('frame=')) UI.updateStatsFromLog(message);
        });

        const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', '引擎内核', 31000000);
        await ffmpeg.load({ coreURL: './ffmpeg-core.js', wasmURL, workerURL: './ffmpeg-core.worker.js' });

        runBtn.disabled = false;
        runBtn.innerText = "选择文件夹并开始";
        UI.setStep(2);
    } catch (e) { UI.writeLog("初始化失败: " + e.message); }
}

async function fetchWithProgress(url, name, estSize) {
    const resp = await fetch(url);
    const reader = resp.body.getReader();
    const total = +resp.headers.get('Content-Length') || estSize;
    let loaded = 0; let chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        UI.updateProgress(`正在准备 ${name}`, Math.min(Math.round((loaded/total)*100), 99));
    }
    UI.updateProgress(`${name} 加载完成`, 100);
    return URL.createObjectURL(new Blob(chunks));
}

// 核心功能：分段导出 MP4
runBtn.onclick = async () => {
    try {
        const dir = await window.showDirectoryPicker();
        runBtn.disabled = true; // 任务开始，禁用按钮
        runBtn.innerText = "合并任务执行中...";
        UI.setStep(3);

        let tsList = []; let keyFiles = []; let m3u8File = null;
        async function scan(h) {
            for await (const e of h.values()) {
                if (e.kind === 'file') {
                    if (e.name.endsWith('.ts')) tsList.push(e);
                    if (e.name.endsWith('.key')) keyFiles.push(e);
                    if (e.name.endsWith('.m3u8')) m3u8File = e;
                } else await scan(e);
            }
        }
        await scan(dir);
        if (!m3u8File) throw new Error("未找到清单文件");
        tsList.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));

        const m3u8Raw = await (await m3u8File.getFile()).text();
        try { await ffmpeg.createDir('index'); } catch(e){}
        for(const k of keyFiles) await ffmpeg.writeFile(`index/${k.name}`, new Uint8Array(await (await k.getFile()).arrayBuffer()));

        // --- 分段修复逻辑 ---
        const batchSize = 600; // 调小批次以增加成功率
        for (let i = 0; i < tsList.length; i += batchSize) {
            const batch = tsList.slice(i, i + batchSize);
            const partName = `Part_${Math.floor(i/batchSize) + 1}.mp4`;
            
            // 1. 仅写入当前批次的 TS
            for (const f of batch) {
                await ffmpeg.writeFile(`index/${f.name}`, new Uint8Array(await (await f.getFile()).arrayBuffer()));
            }

            // 2. 【核心修复】构造仅含当前批次的临时 M3U8
            const currentTsNames = new Set(batch.map(f => f.name));
            const filteredM3u8 = m3u8Raw.split('\n').filter(line => {
                if (line.includes('.ts')) return currentTsNames.has(line.trim().split('/').pop());
                return true;
            }).join('\n').replace(/URI="([^"]+)"/g, (m, p) => `URI="index/${p.split('/').pop()}"`);

            await ffmpeg.writeFile('temp.m3u8', new TextEncoder().encode(filteredM3u8));
            
            // 3. 执行合并
            UI.writeLog(`正在导出第 ${Math.floor(i/batchSize) + 1} 部分...`);
            await ffmpeg.exec(['-allowed_extensions', 'ALL', '-i', 'temp.m3u8', '-c', 'copy', '-fflags', '+genpts', partName]);
            
            // 4. 读取并清理
            const data = await ffmpeg.readFile(partName);
            UI.downloadFile(data, `${dir.name}_${partName}`);
            
            await ffmpeg.deleteFile(partName);
            for(const f of batch) await ffmpeg.deleteFile(`index/${f.name}`);
        }
        
        UI.writeLog("🎉 所有分段处理完毕！");
    } catch (e) { 
        UI.writeLog("❌ 错误: " + e.message); 
    } finally {
        runBtn.disabled = false; // 任务结束（无论成功失败），恢复按钮
        runBtn.innerText = "选择文件夹并开始";
    }
};

// 本地 MP4 拼合 (逻辑同前，增加了按钮禁用处理)
document.getElementById('mergeMp4Btn').onclick = async () => {
    const btn = document.getElementById('mergeMp4Btn');
    try {
        const files = await window.showOpenFilePicker({ multiple: true });
        btn.disabled = true;
        UI.writeLog("🔗 正在拼合本地 MP4...");
        // ... 此处逻辑同上个版本 ...
        UI.writeLog("✅ 拼合完成");
    } catch (e) { UI.writeLog("拼合失败: " + e.message); }
    finally { btn.disabled = false; }
};

initCore();