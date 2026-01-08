let ffmpeg = null;

async function initCore() {
    const runBtn = document.getElementById('runBtn');
    try {
        const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('log', ({ message }) => {
            UI.writeLog(`[内核] ${message}`);
            if (message.includes('frame=')) UI.updateStatsFromLog(message);
        });

        // 细化初始化进度
        const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', '引擎内核', 31000000);
        UI.updateProgress("正在启动本地解码环境 (1/2)...", 50);
        await ffmpeg.load({ coreURL: './ffmpeg-core.js', wasmURL, workerURL: './ffmpeg-core.worker.js' });
        UI.updateProgress("引擎就绪 (2/2)", 100);
        
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.innerText = "选择文件夹并开始";
        }
        UI.setStep(2);
    } catch (e) { UI.writeLog("初始化失败: " + e.message); }
}

async function fetchWithProgress(url, name, estSize) {
    const resp = await fetch(url);
    const reader = resp.body.getReader();
    const total = +resp.headers.get('Content-Length') || estSize;
    let loaded = 0;
    let chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;

        // 计算物理数值
        const loadedMB = (loaded / 1024 / 1024).toFixed(1);
        const totalMB = (total / 1024 / 1024).toFixed(1);
        
        /**
         * 优化：非线性进度映射
         * 将真实的 0%-100% 下载进度映射到 UI 的 0%-92%
         * 剩下的 8% 留给“浏览器缓冲区处理和内存写入”
         */
        const downloadPct = Math.round((loaded / total) * 92);
        
        UI.updateProgress(
            `下载引擎: ${name} (${loadedMB}MB / ${totalMB}MB)`, 
            downloadPct
        );
    }

    // 下载彻底完成后，显示“正在校验与安装”并慢慢跳到 100%
    UI.updateProgress(`校验并安装引擎 (${(total/1024/1024).toFixed(1)}MB)...`, 98);
    
    const blob = new Blob(chunks);
    const blobURL = URL.createObjectURL(blob);
    
    UI.updateProgress(`${name} 加载完成`, 100);
    return blobURL;
}
// 核心合并逻辑
document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('runBtn');
    if (!runBtn) return;

    runBtn.onclick = async () => {
        try {
            const dir = await window.showDirectoryPicker();
            runBtn.disabled = true;
            runBtn.innerText = "合并中...";
            UI.setStep(3);

            let tsList = []; let totalSize = 0; let m3u8File = null; let keyFiles = [];
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
            if (!m3u8File) throw new Error("未找到清单文件");
            tsList.sort((a, b) => a.handle.name.localeCompare(b.handle.name, undefined, {numeric: true}));

            // 智能容量分段
            const CHUNK_LIMIT = 1024 * 1024 * 1024; // 1GB
            let batches = totalSize < 1.5 * CHUNK_LIMIT ? [tsList] : splitBatches(tsList, CHUNK_LIMIT);

            const m3u8Raw = await (await m3u8File.getFile()).text();
            try { await ffmpeg.createDir('index'); } catch(e){}
            for(const k of keyFiles) await ffmpeg.writeFile(`index/${k.name}`, new Uint8Array(await (await k.getFile()).arrayBuffer()));

            let totalIdx = 0;
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const partName = `Part_${i + 1}.mp4`;
                for (const ts of batch) {
                    totalIdx++;
                    UI.updateProgress(`正在准备数据 (${totalIdx}/${tsList.length})`, Math.round((totalIdx/tsList.length)*100));
                    await ffmpeg.writeFile(`index/${ts.handle.name}`, new Uint8Array(await (await ts.handle.getFile()).arrayBuffer()));
                }

                // 局部清单构造
                const currentNames = new Set(batch.map(t => t.handle.name));
                const filtered = m3u8Raw.split('\n').filter(l => l.includes('.ts') ? currentNames.has(l.trim().split('/').pop()) : true).join('\n').replace(/URI="([^"]+)"/g, (m, p) => `URI="index/${p.split('/').pop()}"`);
                await ffmpeg.writeFile('temp.m3u8', new TextEncoder().encode(filtered));

                // 合并
                await ffmpeg.exec(['-allowed_extensions', 'ALL', '-i', 'temp.m3u8', '-c', 'copy', '-fflags', '+genpts+igndts', partName]);
                const data = await ffmpeg.readFile(partName);
                UI.downloadFile(data, `${dir.name}_${partName}`);
                
                await ffmpeg.deleteFile(partName);
                for(const ts of batch) await ffmpeg.deleteFile(`index/${ts.handle.name}`);
            }
            UI.writeLog("🎉 任务完成");
        } catch (e) { UI.writeLog("❌ 失败: " + e.message); }
        finally { runBtn.disabled = false; runBtn.innerText = "选择文件夹并开始"; UI.setStep(2); }
    };
});

function splitBatches(list, limit) {
    let res = []; let cur = []; let sum = 0;
    for(const t of list) {
        cur.push(t); sum += t.size;
        if(sum >= limit) { res.push(cur); cur = []; sum = 0; }
    }
    if(cur.length) res.push(cur);
    return res;
}

initCore();
/**
 * 核心逻辑补全：本地 MP4 无损拼合
 * 对应 index.html 中的 mergeMp4Btn 按钮
 */
// 在 video-core.js 中
document.addEventListener('DOMContentLoaded', () => {
    const mergeBtn = document.getElementById('mergeMp4Btn');
    if (!mergeBtn) return;

    mergeBtn.onclick = async () => {
        try {
            const files = await window.showOpenFilePicker({ multiple: true });
            mergeBtn.disabled = true;
            mergeBtn.innerText = "正在拼合...";
            
            UI.writeLog(`🔗 选中 ${files.length} 个分段，开始无损合并...`);
            
            let listTxt = "";
            for (let i = 0; i < files.length; i++) {
                const f = await files[i].getFile();
                const vfsName = `m${i}.mp4`;
                UI.updateProgress(`读取分段 ${i+1}/${files.length}`, Math.round((i/files.length)*100));
                
                await ffmpeg.writeFile(vfsName, new Uint8Array(await f.arrayBuffer()));
                listTxt += `file '${vfsName}'\n`;
            }

            await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listTxt));
            
            // 无损合并：-c copy 保护画质且速度极快
            await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'Output_Total.mp4']);
            
            const data = await ffmpeg.readFile('Output_Total.mp4');
            UI.downloadFile(data, "合并完成_Total.mp4");
            
            // 内存清理
            await ffmpeg.deleteFile('Output_Total.mp4');
            UI.writeLog("✅ 合并成功！");
        } catch (e) {
            UI.writeLog("❌ 拼合失败: " + e.message);
        } finally {
            mergeBtn.disabled = false;
            mergeBtn.innerText = "🧩 选中本地 MP4 文件并拼合";
            UI.updateProgress("就绪", 0);
        }
    };
});