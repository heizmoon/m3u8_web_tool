let ffmpeg = null;

let ffmpeg = null;
const RUN_BTN = document.getElementById('runBtn');
const FIXED_ENGINE_SIZE = 31.2 * 1024 * 1024; // 固定 31.2MB

async function initCore() {
    try {
        const { FFmpeg } = window.FFmpegWASM || window.FFmpeg;
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('log', ({ message }) => {
            UI.writeLog(`[内核] ${message}`);
            if (message.includes('frame=')) UI.updateStatsFromLog(message);
        });

        // 1. 下载阶段：强制显示 31.2MB 总量
        const wasmURL = await fetchWithProgress('./ffmpeg-core.wasm', '引擎内核', FIXED_ENGINE_SIZE);
        
        // 2. 拆分加载阶段：显示 1/3, 2/3, 3/3
        UI.updateProgress("正在加载核心组件 (1/3): ffmpeg-core.js", 96);
        const coreURL = './ffmpeg-core.js';
        
        UI.updateProgress("正在加载核心组件 (2/3): ffmpeg-worker.js", 98);
        const workerURL = './ffmpeg-core.worker.js';

        UI.updateProgress("正在初始化引擎 (3/3): 环境部署", 99);
        await ffmpeg.load({ coreURL, wasmURL, workerURL });

        UI.updateProgress("准备就绪", 100);
        if (RUN_BTN) {
            RUN_BTN.disabled = false;
            RUN_BTN.innerText = "选择文件夹并开始";
        }
        UI.setStep(2);
    } catch (e) { 
        UI.writeLog("初始化失败: " + e.message); 
    }
}
async function fetchWithProgress(url, name, fixedSize) {
    const resp = await fetch(url);
    const reader = resp.body.getReader();
    let loaded = 0;
    let chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;

        // 统一单位：MB
        const loadedMB = (loaded / 1024 / 1024).toFixed(1);
        const totalMB = (fixedSize / 1024 / 1024).toFixed(1);
        
        // 进度映射到 0-95%
        let pct = Math.min(Math.round((loaded / fixedSize) * 95), 95);

        UI.updateProgress(
            `下载引擎: ${name} (${loadedMB}MB / ${totalMB}MB)`, 
            pct
        );
    }
    return URL.createObjectURL(new Blob(chunks));
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
    // 同步显示：处理中: 1218 / 2299
    const progressText = `处理中: ${totalIdx} / ${tsList.length}`;
    const progressPct = Math.round((totalIdx / tsList.length) * 100);
    UI.updateProgress(progressText, progressPct);
    
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
// 在 video-core.js 末尾绑定
document.addEventListener('DOMContentLoaded', () => {
    const mergeBtn = document.getElementById('mergeMp4Btn');
    if (!mergeBtn) return;

    mergeBtn.onclick = async () => {
        try {
            const files = await window.showOpenFilePicker({ multiple: true });
            mergeBtn.disabled = true;
            UI.writeLog("🔗 开始无损拼合本地文件...");
            
            let listTxt = "";
            for (let i = 0; i < files.length; i++) {
                const f = await files[i].getFile();
                const vfsName = `m${i}.mp4`;
                // 同步进度显示
                UI.updateProgress(`读取分段: ${i+1} / ${files.length}`, Math.round((i/files.length)*100));
                
                await ffmpeg.writeFile(vfsName, new Uint8Array(await f.arrayBuffer()));
                listTxt += `file '${vfsName}'\n`;
            }

            await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listTxt));
            await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'Total_Merged.mp4']);
            
            const data = await ffmpeg.readFile('Total_Merged.mp4');
            UI.downloadFile(data, "合并结果_Full.mp4");
            UI.writeLog("✅ 拼合任务已完成！");
        } catch (e) {
            UI.writeLog("❌ 拼合失败: " + e.message);
        } finally {
            mergeBtn.disabled = false;
            UI.updateProgress("就绪", 0);
        }
    };
});