let ffmpeg = null;
const runBtn = document.getElementById('runBtn');

async function initCore() {
    try {
        const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
        ffmpeg = new FFmpeg();
        
        // 挂载日志监听：这是显示时长、速度的关键
        ffmpeg.on('log', ({ message }) => {
            UI.writeLog(`[内核] ${message}`);
            if (message.includes('frame=')) {
                UI.updateStatsFromLog(message); // 实时更新统计信息
            }
        });

        const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', '引擎内核', 31000000);
        
        UI.updateProgress("正在配置本地解码环境...", 50);
        await ffmpeg.load({ 
            coreURL: './ffmpeg-core.js', 
            wasmURL, 
            workerURL: './ffmpeg-core.worker.js' 
        });
        
        UI.updateProgress("准备就绪", 100);
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
        UI.updateProgress(`下载引擎: ${name}`, Math.min(Math.round((loaded/total)*100), 99));
    }
    return URL.createObjectURL(new Blob(chunks));
}

runBtn.onclick = async () => {
    try {
        const dir = await window.showDirectoryPicker();
        runBtn.disabled = true;
        runBtn.innerText = "任务处理中...";
        UI.setStep(3);

        let tsList = []; let keyFiles = []; let m3u8File = null;
        let totalSize = 0;

        // 递归扫描
        async function scan(h) {
            for await (const e of h.values()) {
                if (e.kind === 'file') {
                    const f = await e.getFile();
                    if (e.name.endsWith('.ts')) { tsList.push({handle: e, size: f.size}); totalSize += f.size; }
                    else if (e.name.endsWith('.key')) keyFiles.push(e);
                    else if (e.name.endsWith('.m3u8')) m3u8File = e;
                } else await scan(e);
            }
        }
        await scan(dir);
        if (!m3u8File) throw new Error("未找到 M3U8 清单文件");
        tsList.sort((a, b) => a.handle.name.localeCompare(b.handle.name, undefined, {numeric: true}));

        // 智能体积切片逻辑：单段约 1GB
        const CHUNK_LIMIT = 1000 * 1024 * 1024; 
        let batches = [];
        if (totalSize < 1.4 * 1024 * 1024 * 1024) {
            batches = [tsList];
        } else {
            let curBatch = []; let curSum = 0;
            for(const ts of tsList) {
                curBatch.push(ts); curSum += ts.size;
                if(curSum >= CHUNK_LIMIT) { batches.push(curBatch); curBatch = []; curSum = 0; }
            }
            if(curBatch.length > 0) batches.push(curBatch);
        }

        const m3u8Raw = await (await m3u8File.getFile()).text();
        try { await ffmpeg.createDir('index'); } catch(e){}
        for(const k of keyFiles) {
            await ffmpeg.writeFile(`index/${k.name}`, new Uint8Array(await (await k.getFile()).arrayBuffer()));
        }

        let totalProcessed = 0;
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const partName = `Part_${i + 1}.mp4`;
            
            UI.writeLog(`--- 正在合并第 ${i+1} / ${batches.length} 段 ---`);
            
            // 写入片段到内存
            for (const ts of batch) {
                totalProcessed++;
                // 实时更新进度条：防止“一瞬间拉满”
                UI.updateProgress(`正在准备数据 (${totalProcessed}/${tsList.length})`, Math.round((totalProcessed/tsList.length)*100));
                await ffmpeg.writeFile(`index/${ts.handle.name}`, new Uint8Array(await (await ts.handle.getFile()).arrayBuffer()));
            }

            // 构造局部清单
            const currentTsNames = new Set(batch.map(t => t.handle.name));
            const filteredM3u8 = m3u8Raw.split('\n').filter(line => {
                if (line.includes('.ts')) return currentTsNames.has(line.trim().split('/').pop());
                return true;
            }).join('\n').replace(/URI="([^"]+)"/g, (m, p) => `URI="index/${p.split('/').pop()}"`);

            await ffmpeg.writeFile('temp.m3u8', new TextEncoder().encode(filteredM3u8));
            
            // 执行 FFmpeg：加入 -t 参数（如果需要）和 -fflags 保证不卡死
            await ffmpeg.exec([
                '-allowed_extensions', 'ALL', 
                '-i', 'temp.m3u8', 
                '-c', 'copy', 
                '-fflags', '+genpts+igndts', // 核心修复：忽略坏时间戳，防止无限循环
                '-movflags', '+faststart', 
                partName
            ]);
            
            const data = await ffmpeg.readFile(partName);
            UI.downloadFile(data, `${dir.name}_${partName}`);
            
            // 立即清理已处理的数据，释放 WASM 内存
            await ffmpeg.deleteFile(partName);
            for(const ts of batch) await ffmpeg.deleteFile(`index/${ts.handle.name}`);
        }
        
        UI.writeLog("🎉 任务圆满完成！");
        UI.setStep(2); 
    } catch (e) { 
        UI.writeLog("❌ 操作失败: " + e.message); 
        UI.setStep(2);
    } finally {
        runBtn.disabled = false;
        runBtn.innerText = "选择文件夹并开始";
    }
};

// 启动
initCore();