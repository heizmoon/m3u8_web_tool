let ffmpeg = null;
const runBtn = document.getElementById('runBtn');

async function initCore() {
    try {
        const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('log', ({ message }) => {
            UI.writeLog(`[内核] ${message}`);
        });

        // 1. 下载阶段
        const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', '引擎内核', 31000000);
        
        // 2. 初始化阶段 (解决“等待很久”的焦虑)
        UI.updateProgress("正在初始化系统进程 (1/3)...", 30);
        await ffmpeg.load({ 
            coreURL: './ffmpeg-core.js', 
            wasmURL, 
            workerURL: './ffmpeg-core.worker.js' 
        });

        UI.updateProgress("配置解码器环境 (2/3)...", 60);
        // 模拟一些 FFmpeg 的预热配置或检测
        await ffmpeg.exec(['-version']); 
        
        UI.updateProgress("准备就绪 (3/3)", 100);
        
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
        UI.updateProgress(`正在下载 ${name}`, Math.min(Math.round((loaded/total)*100), 99));
    }
    return URL.createObjectURL(new Blob(chunks));
}

runBtn.onclick = async () => {
    try {
        const dir = await window.showDirectoryPicker();
        runBtn.disabled = true;
        UI.setStep(3);

        let tsList = []; let keyFiles = []; let m3u8File = null;
        let totalSize = 0;

        async function scan(h) {
            for await (const e of h.values()) {
                if (e.kind === 'file') {
                    if (e.name.endsWith('.ts')) {
                        const file = await e.getFile();
                        tsList.push({handle: e, size: file.size});
                        totalSize += file.size;
                    }
                    if (e.name.endsWith('.key')) keyFiles.push(e);
                    if (e.name.endsWith('.m3u8')) m3u8File = e;
                } else await scan(e);
            }
        }
        await scan(dir);
        tsList.sort((a, b) => a.handle.name.localeCompare(b.handle.name, undefined, {numeric: true}));

        // --- 智能分段逻辑 ---
        const MAX_BATCH_SIZE = 1024 * 1024 * 1000; // 约 1GB 一段
        let batches = [];
        if (totalSize < 1.5 * 1024 * 1024 * 1000) { // 1.5GB 以下不分段
            batches = [tsList];
        } else {
            let currentBatch = [];
            let currentBatchSize = 0;
            for (const ts of tsList) {
                currentBatch.push(ts);
                currentBatchSize += ts.size;
                if (currentBatchSize >= MAX_BATCH_SIZE) {
                    batches.push(currentBatch);
                    currentBatch = [];
                    currentBatchSize = 0;
                }
            }
            if (currentBatch.length > 0) batches.push(currentBatch);
        }

        const m3u8Raw = await (await m3u8File.getFile()).text();
        try { await ffmpeg.createDir('index'); } catch(e){}
        for(const k of keyFiles) await ffmpeg.writeFile(`index/${k.name}`, new Uint8Array(await (await k.getFile()).arrayBuffer()));

        // --- 执行合并 ---
        let processedTsCount = 0;
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const partName = `Part_${i + 1}.mp4`;
            
            for (const ts of batch) {
                processedTsCount++;
                // 更新进度：显示当前片段/总片段
                UI.updateProgress(`处理中: ${processedTsCount} / ${tsList.length}`, Math.round((processedTsCount/tsList.length)*100));
                
                await ffmpeg.writeFile(`index/${ts.handle.name}`, new Uint8Array(await (await ts.handle.getFile()).arrayBuffer()));
            }

            const currentTsNames = new Set(batch.map(ts => ts.handle.name));
            const filteredM3u8 = m3u8Raw.split('\n').filter(line => {
                if (line.includes('.ts')) return currentTsNames.has(line.trim().split('/').pop());
                return true;
            }).join('\n').replace(/URI="([^"]+)"/g, (m, p) => `URI="index/${p.split('/').pop()}"`);

            await ffmpeg.writeFile('temp.m3u8', new TextEncoder().encode(filteredM3u8));
            await ffmpeg.exec(['-allowed_extensions', 'ALL', '-i', 'temp.m3u8', '-c', 'copy', '-fflags', '+genpts', partName]);
            
            const data = await ffmpeg.readFile(partName);
            UI.downloadFile(data, `${dir.name}_${partName}`);
            
            // 清理
            await ffmpeg.deleteFile(partName);
            for(const ts of batch) await ffmpeg.deleteFile(`index/${ts.handle.name}`);
        }
        
        UI.writeLog("🎉 任务圆满完成！");
        UI.setStep(2); // 任务结束，自动回到第二步
    } catch (e) { 
        UI.writeLog("❌ 错误: " + e.message); 
        UI.setStep(2); // 发生错误也回到第二步供重试
    } finally {
        runBtn.disabled = false;
        runBtn.innerText = "选择文件夹并开始";
    }
};

initCore();